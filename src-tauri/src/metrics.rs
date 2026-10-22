//! CPU and memory per unit, read straight from the cgroup tree, plus whole
//! machine totals from /proc. No D-Bus calls: one directory walk per tick.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::systemd::Bus;

const CGROUP_ROOT: &str = "/sys/fs/cgroup";

#[derive(Default, Clone, Copy)]
pub struct Usage {
    /// Share of the whole machine, 0–100.
    pub cpu: f32,
    pub mem_bytes: u64,
    /// Paused by the cgroup freezer.
    pub frozen: bool,
}

pub struct SystemStats {
    pub cpu: f32,
    pub mem_used: u64,
    pub mem_total: u64,
}

pub struct Sampler {
    cpus: f32,
    uid: u32,
    /// Last cpu.stat `usage_usec` per cgroup path.
    prev_units: HashMap<PathBuf, (u64, Instant)>,
    /// Last (busy, total) jiffies from /proc/stat.
    prev_total: Option<(u64, u64)>,
}

impl Sampler {
    pub fn new() -> Self {
        let cpus = std::thread::available_parallelism().map_or(1, |n| n.get()) as f32;
        Self {
            cpus,
            uid: current_uid(),
            prev_units: HashMap::new(),
            prev_total: None,
        }
    }

    /// Usage for every unit cgroup on the machine, keyed by (bus, unit name).
    /// CPU is 0 on the first sample since it needs a previous reading.
    pub fn units(&mut self) -> HashMap<(Bus, String), Usage> {
        let mut found = Vec::new();
        let user_manager = format!("user@{}.service", self.uid);
        walk(Path::new(CGROUP_ROOT), Bus::System, &user_manager, &mut found);

        let now = Instant::now();
        let mut next = HashMap::with_capacity(found.len());
        let mut out = HashMap::with_capacity(found.len());

        for (bus, name, path) in found {
            let usec = read_usage_usec(&path);
            let cpu = match (usec, self.prev_units.get(&path)) {
                (Some(cur), Some(&(prev, at))) if cur >= prev => {
                    let wall = now.duration_since(at).as_micros().max(1) as f32;
                    (cur - prev) as f32 / wall / self.cpus * 100.0
                }
                _ => 0.0,
            };
            if let Some(cur) = usec {
                next.insert(path.clone(), (cur, now));
            }
            let mem_bytes = read_mem(&path);
            let frozen = fs::read_to_string(path.join("cgroup.freeze")).is_ok_and(|v| v.trim() == "1");
            out.insert((bus, name), Usage { cpu: cpu.min(100.0), mem_bytes, frozen });
        }

        self.prev_units = next;
        out
    }

    pub fn system(&mut self) -> SystemStats {
        let cpu = match (read_proc_stat(), self.prev_total) {
            (Some((busy, total)), Some((pbusy, ptotal))) if total > ptotal => {
                (busy.saturating_sub(pbusy)) as f32 / (total - ptotal) as f32 * 100.0
            }
            _ => 0.0,
        };
        self.prev_total = read_proc_stat();

        let (mem_total, mem_available) = read_meminfo();
        SystemStats {
            cpu,
            mem_used: mem_total.saturating_sub(mem_available),
            mem_total,
        }
    }
}

/// Collect `.service` / `.scope` cgroups. Descends into slices and into this
/// user's `user@UID.service`, below which everything belongs to the session bus.
fn walk(dir: &Path, bus: Bus, user_manager: &str, out: &mut Vec<(Bus, String, PathBuf)>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        if !entry.file_type().is_ok_and(|t| t.is_dir()) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();

        if name.ends_with(".slice") {
            walk(&path, bus, user_manager, out);
        } else if name == user_manager {
            out.push((bus, name, path.clone()));
            walk(&path, Bus::Session, user_manager, out);
        } else if name.ends_with(".service") || name.ends_with(".scope") {
            out.push((bus, name, path));
        }
    }
}

fn read_u64(path: &Path) -> Option<u64> {
    fs::read_to_string(path).ok()?.trim().parse().ok()
}

/// Memory the unit really holds: `memory.current` minus its file cache, which
/// the kernel can drop at will. Matches how whole-system "used" is counted
/// (total minus available), so per-unit numbers add up to it.
fn read_mem(cgroup: &Path) -> u64 {
    let current = read_u64(&cgroup.join("memory.current")).unwrap_or(0);
    let file = fs::read_to_string(cgroup.join("memory.stat"))
        .ok()
        .and_then(|stat| {
            stat.lines()
                .find_map(|l| l.strip_prefix("file "))
                .and_then(|v| v.trim().parse::<u64>().ok())
        })
        .unwrap_or(0);
    current.saturating_sub(file)
}

fn read_usage_usec(cgroup: &Path) -> Option<u64> {
    let stat = fs::read_to_string(cgroup.join("cpu.stat")).ok()?;
    stat.lines()
        .find_map(|l| l.strip_prefix("usage_usec "))
        .and_then(|v| v.trim().parse().ok())
}

/// (busy, total) jiffies across all CPUs.
fn read_proc_stat() -> Option<(u64, u64)> {
    let stat = fs::read_to_string("/proc/stat").ok()?;
    let line = stat.lines().next()?.strip_prefix("cpu ")?;
    let fields: Vec<u64> = line.split_whitespace().filter_map(|v| v.parse().ok()).collect();
    let total: u64 = fields.iter().take(8).sum();
    // idle + iowait
    let idle = fields.get(3).copied().unwrap_or(0) + fields.get(4).copied().unwrap_or(0);
    Some((total.saturating_sub(idle), total))
}

/// (MemTotal, MemAvailable) in bytes.
fn read_meminfo() -> (u64, u64) {
    let Ok(info) = fs::read_to_string("/proc/meminfo") else { return (0, 0) };
    let kb = |key: &str| {
        info.lines()
            .find_map(|l| l.strip_prefix(key))
            .and_then(|v| v.split_whitespace().next()?.parse::<u64>().ok())
            .unwrap_or(0)
            * 1024
    };
    (kb("MemTotal:"), kb("MemAvailable:"))
}

fn current_uid() -> u32 {
    use std::os::unix::fs::MetadataExt;
    fs::metadata("/proc/self").map_or(0, |m| m.uid())
}

/// The unit this process runs in (so muffle never offers to stop itself).
pub fn own_unit() -> Option<String> {
    let cgroup = fs::read_to_string("/proc/self/cgroup").ok()?;
    let path = cgroup.lines().find_map(|l| l.strip_prefix("0::"))?;
    path.rsplit('/')
        .find(|seg| seg.ends_with(".service") || seg.ends_with(".scope"))
        .map(str::to_string)
}
