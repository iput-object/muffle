import { useState } from "react";
import { api, type GroupView } from "../services/tauri";
import type { Notify } from "../components/StatusBar";

/** Muffle / restore with a per-group busy flag and a status-bar summary. */
export function useGroupActions(notify: Notify, refresh: () => void) {
  const [busy, setBusy] = useState<Set<string>>(new Set());

  async function toggle(group: GroupView) {
    setBusy((s) => new Set(s).add(group.id));
    try {
      const outcome = group.muffled
        ? await api.restoreGroup(group.id)
        : await api.muffleGroup(group.id);
      const verb = group.muffled ? "Restored" : group.mode === "kill" ? "Killed" : "Muffled";
      const n = outcome.done;
      if (outcome.errors.length) {
        notify(`${verb} ${group.name} with ${outcome.errors.length} failed: ${outcome.errors[0]}`, "error");
      } else {
        notify(`${verb} ${group.name}: ${n} unit${n === 1 ? "" : "s"}`);
      }
      refresh();
    } catch (e) {
      notify(`${group.name}: ${e}`, "error");
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(group.id);
        return next;
      });
    }
  }

  return { busy, toggle };
}
