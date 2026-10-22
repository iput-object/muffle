//! Muffling and restoring groups. Shared by the window, the tray and the CLI.

use std::collections::HashSet;

use serde::Serialize;

use crate::protect::Protect;
use crate::store::{self, Action, Group, Muffled, Mode};
use crate::systemd::Buses;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    /// Units acted on.
    pub done: usize,
    /// One line per unit that failed.
    pub errors: Vec<String>,
}

/// Stop or pause every running, unprotected member, remembering what was done.
/// Members that aren't running are skipped (nothing to undo later), and so are
/// members shared with a group that is still on: a unit only goes off once
/// every group it belongs to is off.
pub async fn muffle(buses: &Buses, group: &Group) -> Result<Outcome, String> {
    if store::muffled(&group.id).is_some() {
        return Ok(Outcome { done: 0, errors: vec![] });
    }
    let protect = Protect::load();
    let running: HashSet<(_, String)> = buses
        .running()
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|u| (u.bus, u.name))
        .collect();
    // Already turned off by another group: that group owns the undo.
    let taken: HashSet<_> = store::all_muffled()
        .into_values()
        .flatten()
        .map(|h| (h.unit.bus, h.unit.name))
        .collect();
    let muffled = store::muffled_ids();
    let still_on: Vec<Group> = store::groups()?
        .into_iter()
        .filter(|g| g.id != group.id && !muffled.contains(&g.id))
        .collect();

    let mut entries = Vec::new();
    let mut errors = Vec::new();
    let mut done = 0;
    for unit in &group.units {
        let key = (unit.bus, unit.name.clone());
        let wanted_on = still_on
            .iter()
            .any(|g| g.units.iter().any(|u| u.bus == unit.bus && u.name == unit.name));
        if protect.is_protected(&unit.name) || !running.contains(&key) || taken.contains(&key) || wanted_on {
            continue;
        }
        let app = unit.name.ends_with(".scope");
        let (result, action) = match group.mode {
            // A killed app can't be started again, so there is nothing to undo.
            Mode::Kill => (buses.kill(unit.bus, &unit.name).await, (!app).then_some(Action::Stopped)),
            // A closed app can't be started again either, so Stop pauses apps.
            Mode::Stop if !app => (buses.stop(unit.bus, &unit.name).await, Some(Action::Stopped)),
            _ => (buses.freeze(unit.bus, &unit.name).await, Some(Action::Paused)),
        };
        match result {
            Ok(()) => {
                done += 1;
                if let Some(action) = action {
                    entries.push(Muffled { unit: unit.clone(), action });
                }
            }
            Err(e) => errors.push(format!("{}: {e}", display(unit))),
        }
    }

    // Recorded even if empty, so the group shows as muffled and Restore is offered.
    store::set_muffled(&group.id, entries)?;
    Ok(Outcome { done, errors })
}

/// Undo what `muffle` did for this group, and bring back every member another
/// group turned off: a unit is on as soon as any of its groups is on.
pub async fn restore(buses: &Buses, group_id: &str) -> Result<Outcome, String> {
    let Some(mut entries) = store::muffled(group_id) else {
        return Ok(Outcome { done: 0, errors: vec![] });
    };
    store::clear_muffled(group_id)?;

    let members: Vec<_> = store::groups()?
        .into_iter()
        .find(|g| g.id == group_id)
        .map(|g| g.units.into_iter().map(|u| (u.bus, u.name)).collect())
        .unwrap_or_default();
    entries.extend(store::release(&members)?);

    let mut done = 0;
    let mut errors = Vec::new();
    for entry in entries {
        let result = match entry.action {
            Action::Stopped => buses.start(entry.unit.bus, &entry.unit.name).await,
            Action::Paused => buses.thaw(entry.unit.bus, &entry.unit.name).await,
        };
        match result {
            Ok(()) => done += 1,
            // Gone since (app closed, service removed): nothing left to restore.
            Err(e) if e.to_string().contains("NoSuchUnit") || e.to_string().contains("not loaded") => {}
            Err(e) => errors.push(format!("{}: {e}", display(&entry.unit))),
        }
    }

    Ok(Outcome { done, errors })
}

fn display(unit: &store::UnitRef) -> &str {
    if unit.label.is_empty() { &unit.name } else { &unit.label }
}
