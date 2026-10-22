// Single typed surface for every Rust command (see src-tauri/src/commands.rs).
import { invoke } from "@tauri-apps/api/core";

export type Bus = "system" | "session";

export type Unit = {
  /** `<bus>:<name>`, stable across refreshes. */
  id: string;
  bus: Bus;
  name: string;
  label: string;
  description: string;
  /** data: URI, only for desktop apps. */
  icon: string | null;
  kind: "app" | "service";
  /** Share of the whole machine, 0–100. */
  cpu: number;
  memBytes: number;
  frozen: boolean;
  protected: boolean;
};

export type UnitRef = { bus: Bus; name: string; label: string };

/** Stop: services stop, open apps pause. Pause: everything pauses. Kill: everything is force-closed. */
export type Mode = "stop" | "pause" | "kill";

export type Group = {
  /** Empty for a group that hasn't been saved yet. */
  id: string;
  name: string;
  mode: Mode;
  units: UnitRef[];
};

export type GroupView = Group & { muffled: boolean };

export type Snapshot = {
  units: Unit[];
  groups: GroupView[];
  cpu: number;
  memUsed: number;
  memTotal: number;
};

export type Outcome = { done: number; errors: string[] };

export type StartupItem = {
  id: string;
  kind: "app" | "service";
  bus: Bus;
  /** Desktop id for apps, unit name for services. */
  name: string;
  label: string;
  description: string;
  icon: string | null;
  enabled: boolean;
};

export type Startup = { apps: StartupItem[]; services: StartupItem[] };

export type Settings = {
  refreshSeconds: number;
  protected: string[];
};

export type SettingsView = Settings & { builtInProtected: string[] };

const unitArgs = (u: { bus: Bus; name: string }) => ({ bus: u.bus, name: u.name });

export const unitRef = (u: Unit): UnitRef => ({ bus: u.bus, name: u.name, label: u.label });

export const api = {
  snapshot: () => invoke<Snapshot>("snapshot"),

  stopUnit: (u: Unit) => invoke<void>("stop_unit", unitArgs(u)),
  startUnit: (u: Unit) => invoke<void>("start_unit", unitArgs(u)),
  pauseUnit: (u: Unit) => invoke<void>("pause_unit", unitArgs(u)),
  resumeUnit: (u: Unit) => invoke<void>("resume_unit", unitArgs(u)),

  saveGroup: (group: Group) => invoke<Group>("save_group", { group }),
  deleteGroup: (id: string) => invoke<void>("delete_group", { id }),
  addToGroup: (id: string, unit: UnitRef) => invoke<Group>("add_to_group", { id, unit }),
  muffleGroup: (id: string) => invoke<Outcome>("muffle_group", { id }),
  restoreGroup: (id: string) => invoke<Outcome>("restore_group", { id }),

  listStartup: () => invoke<Startup>("list_startup"),
  setStartup: (item: StartupItem, enabled: boolean) =>
    invoke<void>("set_startup", { kind: item.kind, bus: item.bus, name: item.name, enabled }),

  getSettings: () => invoke<SettingsView>("get_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
};
