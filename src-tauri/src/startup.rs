//! What starts on its own: login apps (XDG autostart entries) and services
//! enabled at boot (system bus) or login (session bus).
//!
//! Apps are turned off the XDG way: a copy in `~/.config/autostart` with
//! `Hidden=true`. `systemctl disable` can't do it, since their units are
//! generated at login from these files. Takes effect at the next login.

use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::apps::{icon_data_uri, icon_for_desktop_id};
use crate::protect::Protect;
use crate::store::{self, UnitRef};
use crate::systemd::{Bus, Buses};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    App,
    Service,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupItem {
    id: String,
    kind: Kind,
    bus: Bus,
    /// Desktop id for apps, unit name for services.
    name: String,
    label: String,
    description: String,
    icon: Option<String>,
    enabled: bool,
}

#[derive(Serialize)]
pub struct Startup {
    apps: Vec<StartupItem>,
    services: Vec<StartupItem>,
}

pub async fn list(buses: &Buses) -> Result<Startup, String> {
    Ok(Startup {
        apps: list_apps(),
        services: list_services(buses).await?,
    })
}

pub async fn set(buses: &Buses, kind: Kind, bus: Bus, name: &str, enabled: bool) -> Result<(), String> {
    match kind {
        Kind::App => set_app(name, enabled),
        Kind::Service => {
            if Protect::load().is_protected(name) {
                return Err(format!("{name} is protected"));
            }
            buses.set_enabled(bus, name, enabled).await.map_err(|e| e.to_string())?;
            let unit = UnitRef { bus, name: name.to_string(), label: String::new() };
            store::set_startup_off(unit, !enabled)
        }
    }
}

// ── Services ─────────────────────────────────────────────────────────────────

async fn list_services(buses: &Buses) -> Result<Vec<StartupItem>, String> {
    let protect = Protect::load();
    let mut descriptions = HashMap::new();
    for bus in [Bus::Session, Bus::System] {
        for unit in buses.units(bus).await.map_err(|e| e.to_string())? {
            descriptions.insert((bus, unit.name), unit.description);
        }
    }

    let mut items = Vec::new();
    for bus in [Bus::Session, Bus::System] {
        let enabled = buses.enabled_services(bus).await.map_err(|e| e.to_string())?;
        let off = store::startup_off().into_iter().filter(|u| u.bus == bus).map(|u| u.name);
        let all = enabled.iter().map(|n| (n.clone(), true)).chain(
            off.filter(|n| !enabled.contains(n)).map(|n| (n, false)),
        );
        for (name, on) in all {
            if protect.is_protected(&name) {
                continue;
            }
            items.push(StartupItem {
                id: format!("{}:{name}", bus.as_str()),
                kind: Kind::Service,
                bus,
                label: name.trim_end_matches(".service").to_string(),
                description: descriptions.get(&(bus, name.clone())).cloned().unwrap_or_default(),
                icon: None,
                enabled: on,
                name,
            });
        }
    }
    items.sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
    Ok(items)
}

// ── Apps ─────────────────────────────────────────────────────────────────────

fn user_dir() -> PathBuf {
    env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env::var_os("HOME").unwrap_or_default()).join(".config"))
        .join("autostart")
}

fn system_dirs() -> Vec<PathBuf> {
    env::var("XDG_CONFIG_DIRS")
        .unwrap_or_else(|_| "/etc/xdg".into())
        .split(':')
        .filter(|d| !d.is_empty())
        .map(|d| PathBuf::from(d).join("autostart"))
        .collect()
}

/// The `[Desktop Entry]` keys of one file.
fn entry_keys(text: &str) -> HashMap<String, String> {
    let mut keys = HashMap::new();
    let mut in_entry = false;
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_entry = line == "[Desktop Entry]";
        } else if in_entry {
            if let Some((k, v)) = line.split_once('=') {
                keys.entry(k.trim().to_string()).or_insert_with(|| v.trim().to_string());
            }
        }
    }
    keys
}

/// Whether OnlyShowIn / NotShowIn let this entry run in the current desktop.
fn shows_here(keys: &HashMap<String, String>) -> bool {
    let current = env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    let current: Vec<&str> = current.split(':').filter(|d| !d.is_empty()).collect();
    let listed = |key: &str| {
        keys.get(key).map(|v| v.split(';').any(|d| current.contains(&d)))
    };
    listed("OnlyShowIn").unwrap_or(true) && !listed("NotShowIn").unwrap_or(false)
}

fn list_apps() -> Vec<StartupItem> {
    // User entries override system ones with the same file name.
    let mut files: HashMap<String, PathBuf> = HashMap::new();
    for dir in system_dirs().into_iter().rev().chain([user_dir()]) {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(id) = path.file_name().and_then(|n| n.to_str()).and_then(|n| n.strip_suffix(".desktop")) {
                files.insert(id.to_string(), path);
            }
        }
    }

    let mut items: Vec<StartupItem> = files
        .into_iter()
        .filter(|(id, _)| id != "muffle")
        .filter_map(|(id, path)| {
            let keys = entry_keys(&fs::read_to_string(&path).ok()?);
            if !shows_here(&keys) {
                return None;
            }
            let hidden = keys.get("Hidden").is_some_and(|v| v == "true");
            let gnome_off = keys.get("X-GNOME-Autostart-enabled").is_some_and(|v| v == "false");
            Some(StartupItem {
                id: format!("app:{id}"),
                kind: Kind::App,
                bus: Bus::Session,
                label: keys.get("Name").cloned().unwrap_or_else(|| id.clone()),
                description: keys.get("Comment").cloned().unwrap_or_default(),
                icon: keys
                    .get("Icon")
                    .and_then(|i| icon_data_uri(i))
                    .or_else(|| icon_for_desktop_id(&id)),
                enabled: !hidden && !gnome_off,
                name: id,
            })
        })
        .collect();
    items.sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
    items
}

/// Replace or insert `key=value` inside the `[Desktop Entry]` group.
fn set_key(text: &str, key: &str, value: &str) -> String {
    let mut out = Vec::new();
    let mut in_entry = false;
    let mut done = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            if in_entry && !done {
                out.push(format!("{key}={value}"));
                done = true;
            }
            in_entry = trimmed == "[Desktop Entry]";
        } else if in_entry && trimmed.split_once('=').is_some_and(|(k, _)| k.trim() == key) {
            if !done {
                out.push(format!("{key}={value}"));
                done = true;
            }
            continue;
        }
        out.push(line.to_string());
    }
    if in_entry && !done {
        out.push(format!("{key}={value}"));
    }
    out.join("\n") + "\n"
}

fn set_app(id: &str, enabled: bool) -> Result<(), String> {
    let file = format!("{id}.desktop");
    let user_path = user_dir().join(&file);
    let source = if user_path.is_file() {
        user_path.clone()
    } else {
        system_dirs()
            .into_iter()
            .map(|d| d.join(&file))
            .find(|p| p.is_file())
            .ok_or_else(|| format!("{id}: autostart entry not found"))?
    };
    let text = fs::read_to_string(&source).map_err(|e| e.to_string())?;
    let mut text = set_key(&text, "Hidden", if enabled { "false" } else { "true" });
    if enabled && entry_keys(&text).get("X-GNOME-Autostart-enabled").is_some_and(|v| v == "false") {
        text = set_key(&text, "X-GNOME-Autostart-enabled", "true");
    }
    fs::create_dir_all(user_dir()).map_err(|e| e.to_string())?;
    fs::write(&user_path, text).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_key_replaces_inside_desktop_entry_only() {
        let text = "[Desktop Entry]\nName=A\nHidden=false\n[Desktop Action x]\nHidden=false\n";
        let out = set_key(text, "Hidden", "true");
        assert_eq!(out, "[Desktop Entry]\nName=A\nHidden=true\n[Desktop Action x]\nHidden=false\n");
    }

    #[test]
    fn set_key_inserts_when_missing() {
        let out = set_key("[Desktop Entry]\nName=A\n", "Hidden", "true");
        assert_eq!(out, "[Desktop Entry]\nName=A\nHidden=true\n");
        let out = set_key("[Desktop Entry]\nName=A\n[Other]\nX=1\n", "Hidden", "true");
        assert_eq!(out, "[Desktop Entry]\nName=A\nHidden=true\n[Other]\nX=1\n");
    }
}
