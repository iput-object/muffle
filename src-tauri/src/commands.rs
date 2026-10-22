//! Commands the window calls. One `snapshot` per refresh tick returns
//! everything live (units, totals, groups); the rest act on one thing.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::apps::AppCache;
use crate::groups::{self, Outcome};
use crate::metrics::Sampler;
use crate::protect::Protect;
use crate::startup::{self, Kind, Startup};
use crate::store::{self, Group, Settings, UnitRef};
use crate::systemd::{Bus, Buses};
use crate::tray;

pub struct AppState {
    pub buses: Buses,
    pub sampler: Mutex<Sampler>,
    pub apps: Mutex<AppCache>,
    /// Groups + muffled ids last shown in the tray, to rebuild it only on change.
    pub tray_key: Mutex<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Unit {
    /// `<bus>:<name>`, stable across refreshes.
    id: String,
    bus: Bus,
    name: String,
    label: String,
    description: String,
    icon: Option<String>,
    /// "app" for desktop apps (autostart or launched), "service" otherwise.
    kind: &'static str,
    cpu: f32,
    mem_bytes: u64,
    frozen: bool,
    protected: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupView {
    #[serde(flatten)]
    group: Group,
    muffled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    units: Vec<Unit>,
    groups: Vec<GroupView>,
    cpu: f32,
    mem_used: u64,
    mem_total: u64,
}

/// Label for units without a desktop file: the unit name minus its suffix.
fn stem(name: &str) -> &str {
    name.rsplit_once('.').map_or(name, |(stem, _)| stem)
}

fn group_views() -> Result<Vec<GroupView>, String> {
    let muffled = store::muffled_ids();
    Ok(store::groups()?
        .into_iter()
        .map(|g| GroupView { muffled: muffled.contains(&g.id), group: g })
        .collect())
}

/// Rebuild the tray menu if groups changed (here, in the tray, or via the CLI).
fn sync_tray(app: &AppHandle, state: &AppState, groups: &[GroupView]) {
    let key: String = groups
        .iter()
        .map(|g| format!("{}:{}:{};", g.group.id, g.group.name, g.muffled))
        .collect();
    let mut last = state.tray_key.lock().unwrap();
    if *last != key {
        *last = key;
        tray::rebuild(app);
    }
}

#[tauri::command]
pub async fn snapshot(app: AppHandle, state: State<'_, AppState>) -> Result<Snapshot, String> {
    let raw = state.buses.running().await.map_err(|e| e.to_string())?;
    let protect = Protect::load();

    let (usage, system) = {
        let mut sampler = state.sampler.lock().unwrap();
        (sampler.units(), sampler.system())
    };

    let mut units: Vec<Unit> = {
        let mut apps = state.apps.lock().unwrap();
        raw.into_iter()
            .filter(|u| !u.is_container())
            .map(|u| {
                let is_app = u.name.starts_with("app-");
                let info = if is_app { apps.get(&u.name) } else { Default::default() };
                let use_ = usage.get(&(u.bus, u.name.clone())).copied().unwrap_or_default();
                Unit {
                    id: format!("{}:{}", u.bus.as_str(), u.name),
                    protected: protect.is_protected(&u.name),
                    label: info.name.unwrap_or_else(|| stem(&u.name).to_string()),
                    icon: info.icon,
                    kind: if is_app { "app" } else { "service" },
                    cpu: use_.cpu,
                    mem_bytes: use_.mem_bytes,
                    frozen: use_.frozen,
                    bus: u.bus,
                    description: u.description,
                    name: u.name,
                }
            })
            .collect()
    };
    units.sort_by(|a, b| b.cpu.total_cmp(&a.cpu).then(b.mem_bytes.cmp(&a.mem_bytes)));

    let groups = group_views()?;
    sync_tray(&app, &state, &groups);

    Ok(Snapshot {
        units,
        groups,
        cpu: system.cpu,
        mem_used: system.mem_used,
        mem_total: system.mem_total,
    })
}

// ── Single units ─────────────────────────────────────────────────────────────

fn ensure_unprotected(name: &str) -> Result<(), String> {
    if Protect::load().is_protected(name) {
        return Err(format!("{name} is protected"));
    }
    Ok(())
}

#[tauri::command]
pub async fn stop_unit(state: State<'_, AppState>, bus: Bus, name: String) -> Result<(), String> {
    ensure_unprotected(&name)?;
    state.buses.stop(bus, &name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_unit(state: State<'_, AppState>, bus: Bus, name: String) -> Result<(), String> {
    state.buses.start(bus, &name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pause_unit(state: State<'_, AppState>, bus: Bus, name: String) -> Result<(), String> {
    ensure_unprotected(&name)?;
    state.buses.freeze(bus, &name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_unit(state: State<'_, AppState>, bus: Bus, name: String) -> Result<(), String> {
    state.buses.thaw(bus, &name).await.map_err(|e| e.to_string())
}

// ── Groups ───────────────────────────────────────────────────────────────────

/// Tell the window and the tray that groups changed.
pub fn groups_changed(app: &AppHandle) {
    tray::rebuild(app);
    let _ = app.emit("groups-changed", ());
}

#[tauri::command]
pub fn save_group(app: AppHandle, group: Group) -> Result<Group, String> {
    let saved = store::save_group(group)?;
    groups_changed(&app);
    Ok(saved)
}

#[tauri::command]
pub async fn delete_group(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<(), String> {
    // Never strand stopped units: restore before forgetting the group.
    groups::restore(&state.buses, &id).await?;
    store::delete_group(&id)?;
    groups_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn add_to_group(app: AppHandle, id: String, unit: UnitRef) -> Result<Group, String> {
    let group = store::add_to_group(&id, unit)?;
    groups_changed(&app);
    Ok(group)
}

#[tauri::command]
pub async fn muffle_group(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<Outcome, String> {
    let group = store::find_group(&id)?;
    let outcome = groups::muffle(&state.buses, &group).await?;
    groups_changed(&app);
    Ok(outcome)
}

#[tauri::command]
pub async fn restore_group(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<Outcome, String> {
    let outcome = groups::restore(&state.buses, &id).await?;
    groups_changed(&app);
    Ok(outcome)
}

// ── Startup ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_startup(state: State<'_, AppState>) -> Result<Startup, String> {
    startup::list(&state.buses).await
}

#[tauri::command]
pub async fn set_startup(
    state: State<'_, AppState>,
    kind: Kind,
    bus: Bus,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    startup::set(&state.buses, kind, bus, &name, enabled).await
}

// ── Settings ─────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    #[serde(flatten)]
    settings: Settings,
    built_in_protected: &'static [&'static str],
}

#[tauri::command]
pub fn get_settings() -> SettingsView {
    SettingsView {
        settings: store::settings(),
        built_in_protected: crate::protect::BUILT_IN,
    }
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    store::save_settings(settings)
}
