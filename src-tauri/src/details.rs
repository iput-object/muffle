//! Everything about one unit for the details panel: what systemd says about
//! it (state, unit file, who it runs as, sandboxing) and every process in its
//! cgroup, read from /proc (user, state, memory, threads, capabilities).

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use zbus::{OwnedVariant, Variant};

use crate::systemd::{Bus, Buses};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Details {
    name: String,
    bus: Bus,
    description: String,
    /// "active", "inactive", "failed", …
    active_state: String,
    /// "running", "exited", …
    sub_state: String,
    /// "enabled", "disabled", "static", … (empty for scopes).
    unit_file_state: String,
    /// The unit file on disk, if any.
    unit_file: Option<String>,
    /// When the unit last became active, in Unix milliseconds.
    active_since: Option<u64>,
    main_pid: Option<u32>,
    control_group: Option<String>,
    /// The command line systemd starts (services only).
    exec: Option<String>,
    /// Restart= policy (services only).
    restart: Option<String>,
    /// Who the unit runs as: User=/Group= for services, or the main process's
    /// owner, so scopes and default-root services show something real.
    user: Option<String>,
    group: Option<String>,
    /// DynamicUser= (a throwaway user allocated per start).
    dynamic_user: bool,
    /// Hardening settings worth knowing, services only.
    sandbox: Vec<Setting>,
    processes: Vec<Process>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Setting {
    /// The systemd directive, e.g. "ProtectSystem".
    key: &'static str,
    /// Plain-language label.
    label: &'static str,
    value: String,
    /// Whether the value is the hardened choice.
    hardened: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Process {
    pid: u32,
    ppid: u32,
    name: String,
    /// Full command line; empty for kernel threads or when unreadable.
    cmdline: String,
    user: String,
    uid: u32,
    group: String,
    /// R running, S sleeping, D disk wait, T stopped, Z zombie…
    state: String,
    threads: u32,
    rss_bytes: u64,
    /// Process start time, Unix milliseconds.
    started: Option<u64>,
    /// Effective capabilities by name; all of them reads as "all".
    capabilities: Vec<String>,
    all_capabilities: bool,
}

pub async fn details(buses: &Buses, bus: Bus, name: &str) -> Result<Details, String> {
    let props = buses.properties(bus, name).await.map_err(|e| e.to_string())?;
    let text = |k: &str| props.get(k).and_then(as_string).filter(|s| !s.is_empty());
    let num = |k: &str| props.get(k).and_then(as_u64);
    let flag = |k: &str| props.get(k).and_then(as_bool).unwrap_or(false);

    let control_group = text("ControlGroup");
    // Many small blocking reads (/proc, /etc/passwd, the cgroup tree): keep
    // them off the async runtime so the snapshot refresh isn't held up.
    let processes = match control_group.clone() {
        Some(cg) => tauri::async_runtime::spawn_blocking(move || processes(&cg))
            .await
            .map_err(|e| e.to_string())?,
        None => Vec::new(),
    };
    let main_pid = num("MainPID").map(|p| p as u32).filter(|&p| p != 0);
    let main = main_pid
        .and_then(|pid| processes.iter().find(|p| p.pid == pid))
        .or_else(|| processes.iter().min_by_key(|p| p.pid));

    let is_service = name.ends_with(".service");
    let user = text("User").or_else(|| main.map(|p| p.user.clone()));
    let group = text("Group").or_else(|| main.map(|p| p.group.clone()));

    Ok(Details {
        name: name.to_string(),
        bus,
        description: text("Description").unwrap_or_default(),
        active_state: text("ActiveState").unwrap_or_default(),
        sub_state: text("SubState").unwrap_or_default(),
        unit_file_state: text("UnitFileState").unwrap_or_default(),
        unit_file: text("FragmentPath"),
        active_since: num("ActiveEnterTimestamp").filter(|&t| t != 0).map(|us| us / 1000),
        main_pid,
        exec: is_service.then(|| props.get("ExecStart").and_then(exec_line)).flatten(),
        restart: if is_service { text("Restart") } else { None },
        user,
        group,
        dynamic_user: flag("DynamicUser"),
        sandbox: if is_service { sandbox(&props) } else { Vec::new() },
        control_group,
        processes,
    })
}

// ── D-Bus values ─────────────────────────────────────────────────────────────

fn unwrap<'a>(v: &'a Variant<'a>) -> &'a Variant<'a> {
    match v {
        Variant::Variant(inner) => unwrap(inner),
        other => other,
    }
}

fn as_string(v: &OwnedVariant) -> Option<String> {
    match unwrap(v) {
        Variant::Str(s) => Some(s.to_string()),
        Variant::ObjectPath(p) => Some(p.to_string()),
        _ => None,
    }
}

fn as_u64(v: &OwnedVariant) -> Option<u64> {
    match unwrap(v) {
        Variant::U8(n) => Some(*n as u64),
        Variant::U16(n) => Some(*n as u64),
        Variant::U32(n) => Some(*n as u64),
        Variant::U64(n) => Some(*n),
        Variant::I32(n) => u64::try_from(*n).ok(),
        Variant::I64(n) => u64::try_from(*n).ok(),
        _ => None,
    }
}

fn as_bool(v: &OwnedVariant) -> Option<bool> {
    match unwrap(v) {
        Variant::Bool(b) => Some(*b),
        _ => None,
    }
}

/// ExecStart is `a(sasbttttuii)`: (path, argv, ignore-failure, …). Show the
/// argv of the first entry, which is the command as written in the unit.
fn exec_line(v: &OwnedVariant) -> Option<String> {
    let Variant::Array(entries) = unwrap(v) else { return None };
    let Variant::Structure(first) = entries.inner().first()? else { return None };
    let fields = first.fields();
    let path = match fields.first()? {
        Variant::Str(s) => s.to_string(),
        _ => return None,
    };
    let argv: Vec<String> = match fields.get(1) {
        Some(Variant::Array(a)) => a
            .inner()
            .iter()
            .filter_map(|x| match x {
                Variant::Str(s) => Some(s.to_string()),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    };
    Some(if argv.is_empty() { path } else { argv.join(" ") })
}

/// The hardening directives people actually check, as label + verdict.
fn sandbox(props: &HashMap<String, OwnedVariant>) -> Vec<Setting> {
    let text = |k: &str| props.get(k).and_then(as_string).unwrap_or_default();
    let flag = |k: &str| props.get(k).and_then(as_bool).unwrap_or(false);
    let yes_no = |b: bool| if b { "yes" } else { "no" }.to_string();

    let protect_system = text("ProtectSystem");
    let protect_home = text("ProtectHome");
    let mut out = vec![
        Setting {
            key: "ProtectSystem",
            label: "System files read-only",
            hardened: matches!(protect_system.as_str(), "yes" | "full" | "strict"),
            value: if protect_system.is_empty() { "no".into() } else { protect_system },
        },
        Setting {
            key: "ProtectHome",
            label: "Home folders hidden",
            hardened: matches!(protect_home.as_str(), "yes" | "read-only" | "tmpfs"),
            value: if protect_home.is_empty() { "no".into() } else { protect_home },
        },
    ];
    for (key, label) in [
        ("NoNewPrivileges", "Can't gain new privileges"),
        ("PrivateTmp", "Private /tmp"),
        ("PrivateDevices", "No access to devices"),
        ("PrivateNetwork", "No network"),
        ("ProtectKernelModules", "Can't load kernel modules"),
        ("ProtectKernelTunables", "Can't change kernel settings"),
        ("ProtectControlGroups", "Can't change cgroups"),
        ("RestrictSUIDSGID", "Can't create setuid files"),
    ] {
        let on = flag(key);
        out.push(Setting { key, label, value: yes_no(on), hardened: on });
    }
    out
}

// ── Processes ────────────────────────────────────────────────────────────────

/// Every process in the cgroup and its children, by PID.
fn processes(control_group: &str) -> Vec<Process> {
    let mut pids = Vec::new();
    collect_pids(&Path::new("/sys/fs/cgroup").join(control_group.trim_start_matches('/')), &mut pids);
    pids.sort_unstable();
    pids.dedup();
    let users = id_names("/etc/passwd");
    let groups = id_names("/etc/group");
    let boot = boot_time();
    pids.into_iter().filter_map(|pid| process(pid, &users, &groups, boot)).collect()
}

fn collect_pids(dir: &Path, out: &mut Vec<u32>) {
    if let Ok(text) = fs::read_to_string(dir.join("cgroup.procs")) {
        out.extend(text.lines().filter_map(|l| l.trim().parse::<u32>().ok()));
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        if entry.file_type().is_ok_and(|t| t.is_dir()) {
            collect_pids(&entry.path(), out);
        }
    }
}

fn process(pid: u32, users: &HashMap<u32, String>, groups: &HashMap<u32, String>, boot: Option<u64>) -> Option<Process> {
    let dir = format!("/proc/{pid}");
    let status = fs::read_to_string(format!("{dir}/status")).ok()?;
    let field = |key: &str| {
        status
            .lines()
            .find_map(|l| l.strip_prefix(key)?.strip_prefix(':'))
            .map(str::trim)
    };
    // Uid/Gid lines are "real effective saved fs"; the effective id decides access.
    let effective = |key: &str| field(key)?.split_whitespace().nth(1)?.parse::<u32>().ok();
    let uid = effective("Uid").unwrap_or(0);
    let gid = effective("Gid").unwrap_or(0);
    let cap_eff = field("CapEff").and_then(|h| u64::from_str_radix(h, 16).ok()).unwrap_or(0);
    let (capabilities, all_capabilities) = capability_names(cap_eff);

    let cmdline = fs::read(format!("{dir}/cmdline"))
        .map(|b| {
            b.split(|&c| c == 0)
                .filter(|s| !s.is_empty())
                .map(|s| String::from_utf8_lossy(s).into_owned())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();

    Some(Process {
        pid,
        ppid: field("PPid").and_then(|v| v.parse().ok()).unwrap_or(0),
        name: field("Name").unwrap_or_default().to_string(),
        cmdline,
        user: users.get(&uid).cloned().unwrap_or_else(|| uid.to_string()),
        uid,
        group: groups.get(&gid).cloned().unwrap_or_else(|| gid.to_string()),
        state: field("State").unwrap_or_default().to_string(),
        threads: field("Threads").and_then(|v| v.parse().ok()).unwrap_or(0),
        rss_bytes: field("VmRSS")
            .and_then(|v| v.trim_end_matches("kB").trim().parse::<u64>().ok())
            .map_or(0, |kb| kb * 1024),
        started: boot.and_then(|b| start_time(&dir, b)),
        capabilities,
        all_capabilities,
    })
}

/// uid/gid -> name from /etc/passwd or /etc/group.
fn id_names(path: &str) -> HashMap<u32, String> {
    fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .filter_map(|l| {
            let mut parts = l.split(':');
            let name = parts.next()?;
            let id = parts.nth(1)?.parse().ok()?;
            Some((id, name.to_string()))
        })
        .collect()
}

/// Boot time, Unix seconds (`btime` in /proc/stat).
fn boot_time() -> Option<u64> {
    fs::read_to_string("/proc/stat")
        .ok()?
        .lines()
        .find_map(|l| l.strip_prefix("btime ")?.trim().parse().ok())
}

/// Process start in Unix ms, from field 22 of /proc/PID/stat (clock ticks
/// since boot; USER_HZ is 100 on every Linux build that matters).
fn start_time(dir: &str, boot_secs: u64) -> Option<u64> {
    const TICKS: u64 = 100;
    let stat = fs::read_to_string(format!("{dir}/stat")).ok()?;
    // The command name may contain spaces; fields resume after the last ')'.
    let rest = &stat[stat.rfind(')')? + 2..];
    let ticks: u64 = rest.split_whitespace().nth(19)?.parse().ok()?;
    let at = UNIX_EPOCH + Duration::from_secs(boot_secs) + Duration::from_millis(ticks * 1000 / TICKS);
    at.duration_since(UNIX_EPOCH).ok().map(|d| d.as_millis() as u64).filter(|_| at <= SystemTime::now())
}

/// Capability bit numbers from linux/capability.h.
const CAPS: &[&str] = &[
    "chown", "dac_override", "dac_read_search", "fowner", "fsetid", "kill", "setgid", "setuid",
    "setpcap", "linux_immutable", "net_bind_service", "net_broadcast", "net_admin", "net_raw",
    "ipc_lock", "ipc_owner", "sys_module", "sys_rawio", "sys_chroot", "sys_ptrace", "sys_pacct",
    "sys_admin", "sys_boot", "sys_nice", "sys_resource", "sys_time", "sys_tty_config", "mknod",
    "lease", "audit_write", "audit_control", "setfcap", "mac_override", "mac_admin", "syslog",
    "wake_alarm", "block_suspend", "audit_read", "perfmon", "bpf", "checkpoint_restore",
];

/// Highest capability bit this kernel knows (older kernels have fewer).
fn cap_last_cap() -> u32 {
    fs::read_to_string("/proc/sys/kernel/cap_last_cap")
        .ok()
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(CAPS.len() as u32 - 1)
}

/// Names of the set bits, and whether every capability the kernel has is set (root).
fn capability_names(mask: u64) -> (Vec<String>, bool) {
    capability_names_upto(mask, cap_last_cap())
}

fn capability_names_upto(mask: u64, last: u32) -> (Vec<String>, bool) {
    let names: Vec<String> = (0..=last.min(63))
        .filter(|bit| mask & (1u64 << bit) != 0)
        .map(|bit| match CAPS.get(bit as usize) {
            Some(n) => format!("CAP_{}", n.to_uppercase()),
            None => format!("CAP_{bit}"),
        })
        .collect();
    let all = names.len() == last as usize + 1;
    (names, all)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capabilities_decode() {
        let (names, all) = capability_names(0);
        assert!(names.is_empty() && !all);
        let (names, _) = capability_names(1 << 10 | 1 << 12);
        assert_eq!(names, ["CAP_NET_BIND_SERVICE", "CAP_NET_ADMIN"]);
        let (_, all) = capability_names(u64::MAX);
        assert!(all);
        // Kernel 5.4: 38 capabilities, root has exactly those.
        let (names, all) = capability_names_upto((1 << 38) - 1, 37);
        assert!(all && names.len() == 38);
    }

    #[test]
    fn reads_own_process() {
        let me = std::process::id();
        let p = process(me, &id_names("/etc/passwd"), &id_names("/etc/group"), boot_time()).unwrap();
        assert_eq!(p.pid, me);
        assert!(p.threads >= 1);
        assert!(p.rss_bytes > 0);
        assert!(p.started.is_some());
    }
}

#[cfg(test)]
mod live {
    /// Prints real details for a system service; run with `--ignored`.
    #[test]
    #[ignore]
    fn print_real_unit() {
        let buses = tauri::async_runtime::block_on(crate::systemd::Buses::connect()).unwrap();
        let name = std::env::var("UNIT").unwrap_or_else(|_| "avahi-daemon.service".into());
        let d = tauri::async_runtime::block_on(super::details(&buses, crate::systemd::Bus::System, &name)).unwrap();
        println!("{}", serde_json::to_string_pretty(&d).unwrap());
    }
}
