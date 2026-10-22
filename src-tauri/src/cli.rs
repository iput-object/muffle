//! `muffle <command>`: the same groups from a terminal, no window.
//! Runs before Tauri starts, so it never touches the running app instance.

use std::io::Write;

use crate::groups::{self, Outcome};
use crate::metrics::Sampler;
use crate::store;
use crate::systemd::Buses;

const USAGE: &str = "\
muffle - switch groups of services and apps off and on

Usage:
  muffle                  open the app
  muffle --hidden         start in the tray
  muffle list             running services and apps, by CPU
  muffle groups           groups and whether they're muffled
  muffle off <group>      muffle a group (stop or pause its members)
  muffle on <group>       restore what muffle stopped
  muffle status           muffled groups

Example (fish):
  muffle off heavy; and pnpm dev
";

const COMMANDS: &[&str] = &["list", "groups", "off", "on", "status", "help", "--help", "-h", "--version", "-V"];

/// Handles a CLI invocation and exits; returns normally to start the GUI.
pub fn dispatch() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(cmd) = args.first() else { return };
    if !COMMANDS.contains(&cmd.as_str()) {
        return;
    }

    let code = match tauri::async_runtime::block_on(run(cmd, args.get(1).map(String::as_str))) {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("muffle: {e}");
            1
        }
    };
    std::process::exit(code);
}

async fn run(cmd: &str, arg: Option<&str>) -> Result<(), String> {
    match cmd {
        "help" | "--help" | "-h" => print!("{USAGE}"),
        "--version" | "-V" => println!("muffle {}", env!("CARGO_PKG_VERSION")),
        "groups" | "status" => {
            let muffled = store::muffled_ids();
            let groups = store::groups()?;
            let groups: Vec<_> = groups
                .iter()
                .filter(|g| cmd == "groups" || muffled.contains(&g.id))
                .collect();
            if groups.is_empty() {
                println!("{}", if cmd == "groups" { "No groups yet." } else { "Nothing muffled." });
            }
            for g in groups {
                let mark = if muffled.contains(&g.id) { "muffled" } else { "on" };
                println!("{:<24} {:<7} {} units  ({})", g.name, mark, g.units.len(), g.id);
            }
        }
        "list" => {
            let buses = connect().await?;
            let mut sampler = Sampler::new();
            sampler.units();
            std::thread::sleep(std::time::Duration::from_millis(1000));
            let usage = sampler.units();
            let mut units = buses.running().await.map_err(|e| e.to_string())?;
            units.retain(|u| !u.is_container());
            let key = |u: &crate::systemd::RawUnit| usage.get(&(u.bus, u.name.clone())).map_or(0.0, |x| x.cpu);
            units.sort_by(|a, b| key(b).total_cmp(&key(a)));
            // Stop quietly when piped into `head`.
            let mut out = std::io::stdout().lock();
            for u in units {
                let use_ = usage.get(&(u.bus, u.name.clone())).copied().unwrap_or_default();
                let line = writeln!(
                    out,
                    "{:>5.1}%  {:>6} MB  {:<7} {}",
                    use_.cpu,
                    use_.mem_bytes / 1_048_576,
                    u.bus.as_str(),
                    u.name
                );
                if line.is_err() {
                    break;
                }
            }
        }
        "off" | "on" => {
            let key = arg.ok_or_else(|| format!("usage: muffle {cmd} <group>"))?;
            let group = store::find_group(key)?;
            let buses = connect().await?;
            let outcome = if cmd == "off" {
                groups::muffle(&buses, &group).await?
            } else {
                groups::restore(&buses, &group.id).await?
            };
            report(cmd, &group.name, &outcome);
            if !outcome.errors.is_empty() {
                return Err(format!("{} failed", outcome.errors.len()));
            }
        }
        _ => unreachable!(),
    }
    Ok(())
}

async fn connect() -> Result<Buses, String> {
    Buses::connect().await.map_err(|e| e.to_string())
}

fn report(cmd: &str, name: &str, outcome: &Outcome) {
    let verb = if cmd == "off" { "Muffled" } else { "Restored" };
    let n = outcome.done;
    println!("{verb} {name}: {n} unit{}", if n == 1 { "" } else { "s" });
    for e in &outcome.errors {
        eprintln!("  {e}");
    }
}
