//! Commands the window calls. One `snapshot` per refresh tick returns
//! everything live (units, totals, groups); the rest act on one thing.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::apps::{self, AppCache};
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
    /// Ids of the groups this unit belongs to, by app identity (any launch).
    groups: Vec<String>,
    /// Other scopes of the same app launch, folded into this row (see
    /// `apps::launch_id`). Row actions apply to them too.
    siblings: Vec<String>,
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

    let groups = group_views()?;

    let units: Vec<Unit> = {
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
                    groups: groups
                        .iter()
                        .filter(|g| g.group.units.iter().any(|m| m.matches(u.bus, &u.name)))
                        .map(|g| g.group.id.clone())
                        .collect(),
                    siblings: Vec::new(),
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
    let mut units = merge_launches(units);
    units.sort_by(|a, b| b.cpu.total_cmp(&a.cpu).then(b.mem_bytes.cmp(&a.mem_bytes)));
    sync_tray(&app, &state, &groups);

    Ok(Snapshot {
        units,
        groups,
        cpu: system.cpu,
        mem_used: system.mem_used,
        mem_total: system.mem_total,
    })
}

/// Fold the scopes of one app launch into a single row: the one with an icon
/// (else the biggest) leads, usage is summed, and it counts as paused only
/// when every part is.
fn merge_launches(units: Vec<Unit>) -> Vec<Unit> {
    let mut out: Vec<Unit> = Vec::with_capacity(units.len());
    let mut lead_of: HashMap<(Bus, String), usize> = HashMap::new();
    for unit in units {
        let Some(launch) = apps::launch_id(&unit.name).map(str::to_string) else {
            out.push(unit);
            continue;
        };
        let Some(&i) = lead_of.get(&(unit.bus, launch.clone())) else {
            lead_of.insert((unit.bus, launch), out.len());
            out.push(unit);
            continue;
        };
        let lead = &mut out[i];
        let takes_lead = (unit.icon.is_some(), unit.mem_bytes) > (lead.icon.is_some(), lead.mem_bytes);
        let mut part = unit;
        if takes_lead {
            std::mem::swap(lead, &mut part);
            lead.siblings.append(&mut part.siblings);
        }
        lead.cpu += part.cpu;
        lead.mem_bytes += part.mem_bytes;
        lead.frozen &= part.frozen;
        lead.protected |= part.protected;
        for g in part.groups {
            if !lead.groups.contains(&g) {
                lead.groups.push(g);
            }
        }
        lead.siblings.push(part.name);
    }
    out
}

/// This unit plus the other scopes of its app launch, if it's an app.
async fn with_siblings(buses: &Buses, bus: Bus, name: &str) -> Vec<String> {
    let mut names = vec![name.to_string()];
    if apps::launch_id(name).is_some() {
        if let Ok(units) = buses.units(bus).await {
            names.extend(
                units
                    .into_iter()
                    .filter(|u| u.is_running() && apps::same_launch(name, &u.name))
                    .map(|u| u.name),
            );
        }
    }
    names
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
    for name in with_siblings(&state.buses, bus, &name).await {
        state.buses.stop(bus, &name).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn start_unit(state: State<'_, AppState>, bus: Bus, name: String) -> Result<(), String> {
    for name in with_siblings(&state.buses, bus, &name).await {
        state.buses.start(bus, &name).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pause_unit(state: State<'_, AppState>, bus: Bus, name: String) -> Result<(), String> {
    ensure_unprotected(&name)?;
    for name in with_siblings(&state.buses, bus, &name).await {
        state.buses.freeze(bus, &name).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_unit(state: State<'_, AppState>, bus: Bus, name: String) -> Result<(), String> {
    for name in with_siblings(&state.buses, bus, &name).await {
        state.buses.thaw(bus, &name).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Groups ───────────────────────────────────────────────────────────────────

/// Keep muffled groups muffled while the app runs (it autostarts in the tray):
/// one pass right away, so a block is back as soon as possible after a reboot,
/// then every few seconds to catch relaunched apps and restarted services.
pub fn start_enforcer(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        loop {
            let state = app.state::<AppState>();
            match tauri::async_runtime::block_on(groups::enforce(&state.buses)) {
                Ok(outcome) => {
                    for e in outcome.errors {
                        eprintln!("enforce: {e}");
                    }
                }
                Err(e) => eprintln!("enforce: {e}"),
            }
            std::thread::sleep(std::time::Duration::from_secs(3));
        }
    });
}

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
