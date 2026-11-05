//! Muffling and restoring groups. Shared by the window, the tray and the CLI.
//!
//! Members are matched by identity, not by exact unit name: an app's scope is
//! renamed on every launch (`app-niri-firefox-1234.scope`), so a member stands
//! for every running instance of its app (see `UnitRef::matches`). While a
//! group is muffled, `enforce` keeps it that way across relaunches and reboots.

use std::collections::{HashMap, HashSet};
use std::sync::{LazyLock, Mutex};

use serde::Serialize;

use crate::metrics;
use crate::protect::Protect;
use crate::store::{self, Action, Group, Mode, Muffled, UnitRef};
use crate::systemd::{Bus, Buses};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    /// Units acted on.
    pub done: usize,
    /// One line per unit that failed.
    pub errors: Vec<String>,
}

type Key = (Bus, String);

/// Units `enforce` failed on (say a password prompt was dismissed), so it
/// doesn't retry them every few seconds. Cleared on every muffle or restore.
static FAILED: LazyLock<Mutex<HashSet<Key>>> = LazyLock::new(Default::default);

/// What muffle needs to know about the machine and the other groups.
struct World {
    /// Running services and scopes, without containers (user@, session-…).
    running: Vec<Key>,
    protect: Protect,
    own_unit: Option<String>,
    groups: Vec<Group>,
    muffled: HashSet<String>,
    /// Which muffled group recorded each unit: that group owns its undo.
    owners: HashMap<Key, String>,
}

impl World {
    async fn load(buses: &Buses) -> Result<Self, String> {
        let running = buses
            .running()
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|u| !u.is_container())
            .map(|u| (u.bus, u.name))
            .collect();
        let all = store::all_muffled();
        let owners = all
            .iter()
            .flat_map(|(id, entries)| entries.iter().map(move |e| ((e.unit.bus, e.unit.name.clone()), id.clone())))
            .collect();
        Ok(Self {
            running,
            protect: Protect::load(),
            own_unit: metrics::own_unit(),
            groups: store::groups()?,
            muffled: all.into_keys().collect(),
            owners,
        })
    }

    /// Running units this group's members stand for that may be turned off:
    /// unprotected, not muffle itself (any instance of it), and not wanted on
    /// by another group that is still on (a unit only goes off once every
    /// group it belongs to is off).
    /// The member of `group` that this running unit stands for: directly, or
    /// through another scope of the same app launch (see `apps::launch_id`).
    fn member<'g>(&self, group: &'g Group, bus: Bus, name: &str) -> Option<&'g UnitRef> {
        group.units.iter().find(|u| {
            u.matches(bus, name)
                || self
                    .running
                    .iter()
                    .any(|(b, other)| *b == bus && crate::apps::same_launch(name, other) && u.matches(bus, other))
        })
    }

    fn targets<'g>(&self, group: &'g Group) -> Vec<(Key, &'g UnitRef)> {
        self.running
            .iter()
            .filter_map(|(bus, name)| {
                let member = self.member(group, *bus, name)?;
                Some(((*bus, name.clone()), member))
            })
            .filter(|((_, name), _)| {
                !self.protect.is_protected(name)
                    && !self.own_unit.as_deref().is_some_and(|own| crate::apps::same_unit(own, name))
            })
            .filter(|((bus, name), _)| {
                !self.groups.iter().any(|g| {
                    g.id != group.id && !self.muffled.contains(&g.id) && self.member(g, *bus, name).is_some()
                })
            })
            .collect()
    }
}

/// Apply a group's mode to one running unit. Returns what to undo on restore.
async fn act(buses: &Buses, mode: Mode, bus: Bus, name: &str) -> (zbus::Result<()>, Option<Action>) {
    let app = name.ends_with(".scope");
    match mode {
        // A killed app can't be started again, so there is nothing to undo.
        Mode::Kill => (buses.kill(bus, name).await, (!app).then_some(Action::Stopped)),
        // A closed app can't be started again either, so Stop pauses apps.
        Mode::Stop if !app => (buses.stop(bus, name).await, Some(Action::Stopped)),
        _ => (buses.freeze(bus, name).await, Some(Action::Paused)),
    }
}

async fn undo(buses: &Buses, entry: &Muffled) -> zbus::Result<()> {
    match entry.action {
        Action::Stopped => buses.start(entry.unit.bus, &entry.unit.name).await,
        Action::Paused => buses.thaw(entry.unit.bus, &entry.unit.name).await,
    }
}

fn entry(bus: Bus, name: String, member: &UnitRef, action: Action) -> Muffled {
    Muffled { unit: UnitRef { bus, name, label: member.label.clone() }, action }
}

/// Stop or pause every running instance of every unprotected member,
/// remembering the actual units acted on. Members that aren't running are
/// skipped (`enforce` catches them if they start later), and so are units
/// another muffled group already turned off.
pub async fn muffle(buses: &Buses, group: &Group) -> Result<Outcome, String> {
    if store::muffled(&group.id).is_some() {
        return Ok(Outcome { done: 0, errors: vec![] });
    }
    FAILED.lock().unwrap().clear();
    let world = World::load(buses).await?;

    let mut entries = Vec::new();
    let mut errors = Vec::new();
    let mut done = 0;
    for ((bus, name), member) in world.targets(group) {
        if world.owners.contains_key(&(bus, name.clone())) {
            continue;
        }
        match act(buses, group.mode, bus, &name).await {
            (Ok(()), action) => {
                done += 1;
                entries.extend(action.map(|a| entry(bus, name, member, a)));
            }
            (Err(e), _) => errors.push(format!("{}: {e}", display_name(member, &name))),
        }
    }

    // Recorded even if empty, so the group shows as muffled and Restore is offered.
    store::set_muffled(&group.id, entries)?;
    Ok(Outcome { done, errors })
}

/// Keep every muffled group muffled: turn off members that came back since
/// (a relaunched app, a service started again at boot or login), and record
/// them so restore brings them back. Killed apps aren't recorded, so a Kill
/// group keeps killing new instances. Frozen units are left alone, and units
/// it failed on once are not retried until the next muffle or restore.
/// Cheap when nothing is muffled (no D-Bus calls).
pub async fn enforce(buses: &Buses) -> Result<Outcome, String> {
    let mut done = 0;
    let mut errors = Vec::new();
    if store::muffled_ids().is_empty() {
        return Ok(Outcome { done, errors });
    }
    let mut world = World::load(buses).await?;
    let cgroups = metrics::cgroup_units();

    let groups: Vec<Group> = world.groups.iter().filter(|g| world.muffled.contains(&g.id)).cloned().collect();
    for group in groups {
        let mut entries = Vec::new();
        for (key, member) in world.targets(&group) {
            let owned_elsewhere = world.owners.get(&key).is_some_and(|owner| *owner != group.id);
            let frozen = cgroups.get(&key).copied().unwrap_or(false);
            if owned_elsewhere || frozen || FAILED.lock().unwrap().contains(&key) {
                continue;
            }
            let (bus, name) = key.clone();
            match act(buses, group.mode, bus, &name).await {
                (Ok(()), action) => {
                    done += 1;
                    world.owners.insert(key, group.id.clone());
                    entries.extend(action.map(|a| entry(bus, name, member, a)));
                }
                (Err(e), _) => {
                    errors.push(format!("{}: {e}", display_name(member, &name)));
                    FAILED.lock().unwrap().insert(key);
                }
            }
        }

        let recorded = entries.clone();
        let still_muffled = store::update_muffled(&group.id, |list| {
            let before = list.len();
            // A paused unit that's gone (an app closed, a scope from before a
            // reboot) has nothing left to resume.
            let live = if list.iter().any(|e| e.action == Action::Paused) {
                metrics::cgroup_units()
            } else {
                HashMap::new()
            };
            list.retain(|e| e.action == Action::Stopped || live.contains_key(&(e.unit.bus, e.unit.name.clone())));
            let pruned = list.len() != before;
            let added = !recorded.is_empty();
            store::record(list, recorded);
            pruned || added
        })?;
        // Restored while this pass ran: put back what it just turned off.
        if !still_muffled {
            for e in &entries {
                let _ = undo(buses, e).await;
            }
        }
    }
    Ok(Outcome { done, errors })
}

/// Undo what `muffle` did for this group, and bring back every member another
/// group turned off: a unit is on as soon as any of its groups is on.
pub async fn restore(buses: &Buses, group_id: &str) -> Result<Outcome, String> {
    let Some(mut entries) = store::muffled(group_id) else {
        return Ok(Outcome { done: 0, errors: vec![] });
    };
    store::clear_muffled(group_id)?;
    FAILED.lock().unwrap().clear();

    let members: Vec<UnitRef> = store::groups()?
        .into_iter()
        .find(|g| g.id == group_id)
        .map(|g| g.units)
        .unwrap_or_default();
    entries.extend(store::release(&members)?);

    let mut done = 0;
    let mut errors = Vec::new();
    let mut seen = HashSet::new();
    for entry in entries {
        if !seen.insert((entry.unit.bus, entry.unit.name.clone())) {
            continue;
        }
        match undo(buses, &entry).await {
            Ok(()) => done += 1,
            // Gone since (app closed, service removed): nothing left to restore.
            Err(e) if e.to_string().contains("NoSuchUnit") || e.to_string().contains("not loaded") => {}
            Err(e) => errors.push(format!("{}: {e}", display_name(&entry.unit, &entry.unit.name))),
        }
    }

    Ok(Outcome { done, errors })
}

fn display_name<'a>(member: &'a UnitRef, name: &'a str) -> &'a str {
    if member.label.is_empty() { name } else { &member.label }
}
