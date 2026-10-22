//! Everything muffle remembers, on disk so the window, the tray and the CLI
//! (separate processes) always agree. Every operation re-reads the files.
//!
//! - `~/.config/muffle/config.toml`: groups and settings (hand-editable).
//! - `~/.local/state/muffle/state.json`: what muffle stopped, so it can undo it.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::systemd::Bus;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UnitRef {
    pub bus: Bus,
    pub name: String,
    /// Shown while the unit isn't running (so no live label exists).
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// Stop services; open apps are paused, since a closed app can't be reopened.
    #[default]
    Stop,
    /// Pause everything: no CPU use, memory kept, instant resume.
    Pause,
    /// Force-close everything at once. Services start again on restore; apps
    /// are gone for good.
    Kill,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub mode: Mode,
    #[serde(default)]
    pub units: Vec<UnitRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub refresh_seconds: u32,
    /// Extra never-touch patterns (`name`, `prefix*`, `*suffix`, `*part*`).
    pub protected: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            refresh_seconds: 2,
            protected: Vec::new(),
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Config {
    #[serde(default)]
    settings: Settings,
    #[serde(default, rename = "group")]
    groups: Vec<Group>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Stopped,
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Muffled {
    pub unit: UnitRef,
    pub action: Action,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct State {
    /// Per group id: what muffle did when the group was muffled.
    #[serde(default)]
    muffled: BTreeMap<String, Vec<Muffled>>,
    /// Services muffle disabled at startup, so the Startup page can still list
    /// them (systemd only reports enabled ones without a full scan).
    #[serde(default)]
    startup_off: Vec<UnitRef>,
}

/// Serializes read-modify-write cycles inside one process.
static LOCK: Mutex<()> = Mutex::new(());

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
}

fn config_path() -> PathBuf {
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home().join(".config"))
        .join("muffle/config.toml")
}

fn state_path() -> PathBuf {
    std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home().join(".local/state"))
        .join("muffle/state.json")
}

/// Write via a temp file + rename, so a crash never leaves half a file.
fn write_atomic(path: &PathBuf, text: &str) -> Result<(), String> {
    let dir = path.parent().ok_or("bad path")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn load_config() -> Result<Config, String> {
    match fs::read_to_string(config_path()) {
        Ok(text) => toml::from_str(&text).map_err(|e| format!("config.toml: {e}")),
        Err(_) => Ok(Config::default()),
    }
}

fn save_config(config: &Config) -> Result<(), String> {
    let text = toml::to_string_pretty(config).map_err(|e| e.to_string())?;
    write_atomic(&config_path(), &text)
}

fn load_state() -> State {
    fs::read_to_string(state_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save_state(state: &State) -> Result<(), String> {
    let text = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    write_atomic(&state_path(), &text)
}

// ── Groups ───────────────────────────────────────────────────────────────────

pub fn groups() -> Result<Vec<Group>, String> {
    Ok(load_config()?.groups)
}

/// Find a group by id or (case-insensitive) name, for the CLI and tray.
pub fn find_group(key: &str) -> Result<Group, String> {
    let key = key.to_lowercase();
    groups()?
        .into_iter()
        .find(|g| g.id == key || g.name.to_lowercase() == key)
        .ok_or_else(|| format!("no group named \"{key}\""))
}

fn slug(name: &str) -> String {
    let s: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    if s.is_empty() { "group".into() } else { s }
}

/// Create (empty id) or replace a group. Returns it with its id set.
pub fn save_group(mut group: Group) -> Result<Group, String> {
    let _guard = LOCK.lock().unwrap();
    group.name = group.name.trim().to_string();
    if group.name.is_empty() {
        return Err("Give the group a name".into());
    }
    let mut config = load_config()?;
    if group.id.is_empty() {
        let base = slug(&group.name);
        let mut id = base.clone();
        let mut n = 2;
        while config.groups.iter().any(|g| g.id == id) {
            id = format!("{base}-{n}");
            n += 1;
        }
        group.id = id;
        config.groups.push(group.clone());
    } else if let Some(slot) = config.groups.iter_mut().find(|g| g.id == group.id) {
        *slot = group.clone();
    } else {
        return Err("That group no longer exists".into());
    }
    save_config(&config)?;
    Ok(group)
}

pub fn delete_group(id: &str) -> Result<(), String> {
    let _guard = LOCK.lock().unwrap();
    let mut config = load_config()?;
    config.groups.retain(|g| g.id != id);
    save_config(&config)
}

/// Add one unit to a group (from the ＋ on a running row).
pub fn add_to_group(id: &str, unit: UnitRef) -> Result<Group, String> {
    let mut group = groups()?
        .into_iter()
        .find(|g| g.id == id)
        .ok_or("That group no longer exists")?;
    if !group.units.iter().any(|u| u.bus == unit.bus && u.name == unit.name) {
        group.units.push(unit);
    }
    save_group(group)
}

// ── Settings ─────────────────────────────────────────────────────────────────

pub fn settings() -> Settings {
    load_config().map(|c| c.settings).unwrap_or_default()
}

pub fn save_settings(settings: Settings) -> Result<(), String> {
    let _guard = LOCK.lock().unwrap();
    let mut config = load_config()?;
    config.settings = settings;
    save_config(&config)
}

// ── Muffled state ─────────────────────────────────────────────────────────────

pub fn muffled(group_id: &str) -> Option<Vec<Muffled>> {
    load_state().muffled.remove(group_id)
}

pub fn muffled_ids() -> Vec<String> {
    load_state().muffled.into_keys().collect()
}

/// Every muffled group and what muffle did for it.
pub fn all_muffled() -> BTreeMap<String, Vec<Muffled>> {
    load_state().muffled
}

/// Take the entries for these units out of every muffled group, so the caller
/// can bring them back. The groups stay muffled.
pub fn release(units: &[(Bus, String)]) -> Result<Vec<Muffled>, String> {
    let _guard = LOCK.lock().unwrap();
    let mut state = load_state();
    let mut taken = Vec::new();
    for entries in state.muffled.values_mut() {
        let (hit, keep): (Vec<_>, Vec<_>) = entries
            .drain(..)
            .partition(|e| units.iter().any(|(bus, name)| *bus == e.unit.bus && *name == e.unit.name));
        *entries = keep;
        taken.extend(hit);
    }
    if !taken.is_empty() {
        save_state(&state)?;
    }
    Ok(taken)
}

pub fn set_muffled(group_id: &str, entries: Vec<Muffled>) -> Result<(), String> {
    let _guard = LOCK.lock().unwrap();
    let mut state = load_state();
    state.muffled.insert(group_id.to_string(), entries);
    save_state(&state)
}

pub fn clear_muffled(group_id: &str) -> Result<(), String> {
    let _guard = LOCK.lock().unwrap();
    let mut state = load_state();
    state.muffled.remove(group_id);
    save_state(&state)
}

// ── Startup ──────────────────────────────────────────────────────────────────

pub fn startup_off() -> Vec<UnitRef> {
    load_state().startup_off
}

pub fn set_startup_off(unit: UnitRef, off: bool) -> Result<(), String> {
    let _guard = LOCK.lock().unwrap();
    let mut state = load_state();
    state.startup_off.retain(|u| !(u.bus == unit.bus && u.name == unit.name));
    if off {
        state.startup_off.push(unit);
    }
    save_state(&state)
}
