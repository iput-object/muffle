import type { Unit } from "../services/tauri";

export type UnitType = "app" | "user" | "system";

/** Fixed order: chart segments, legend and the Type filter all follow it. */
export const UNIT_TYPES: { value: UnitType; label: string; short: string; color: string }[] = [
  { value: "app", label: "Apps", short: "App", color: "bg-type-app" },
  { value: "user", label: "User services", short: "User", color: "bg-type-user" },
  { value: "system", label: "System services", short: "System", color: "bg-type-system" },
];

export function unitType(u: Pick<Unit, "kind" | "bus">): UnitType {
  if (u.kind === "app") return "app";
  return u.bus === "system" ? "system" : "user";
}

export const typeInfo = (t: UnitType) => UNIT_TYPES.find((x) => x.value === t)!;
