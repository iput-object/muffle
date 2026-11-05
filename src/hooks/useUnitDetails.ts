import { useEffect, useRef, useState } from "react";
import { api, type Unit, type UnitDetails } from "../services/tauri";

export type MergedDetails = UnitDetails & {
  /** How many scopes were folded into this row (1 for a plain unit). */
  scopes: number;
};

type Loaded = { id: string; details: MergedDetails | null; error: string | null };

/**
 * Details for a unit, re-read whenever `tick` changes (the app's refresh, so
 * never faster than it, and not while the window is hidden). A tick that comes
 * while the last read is still going is skipped. A row that folds several
 * scopes of one app launch reads each of them: the row's own unit describes it,
 * the others only add their processes.
 */
export function useUnitDetails(unit: Unit, running: boolean, tick: unknown) {
  // Tagged with the unit it belongs to, so a switch never shows the last unit's data.
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const seq = useRef(0);
  const inFlight = useRef<string | null>(null);
  const siblings = unit.siblings.join("\n");

  useEffect(() => {
    if (!running || document.hidden || inFlight.current === unit.id) return;
    const id = ++seq.current;
    const unitId = unit.id;
    inFlight.current = unitId;
    const names = [unit.name, ...(siblings ? siblings.split("\n") : [])];
    Promise.allSettled(names.map((name) => api.unitDetails(unit.bus, name)))
      .then(([own, ...rest]) => {
        if (id !== seq.current) return;
        const others = rest.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
        let base: UnitDetails;
        if (own.status === "fulfilled") {
          base = own.value;
        } else if (others.length) {
          // The row's own scope is gone but the launch lives on in its siblings:
          // keep the row's identity, take nothing unit-specific from a sibling.
          base = {
            ...others[0],
            name: unit.name,
            description: "",
            unitFile: null,
            unitFileState: "",
            mainPid: null,
            controlGroup: null,
            exec: null,
            restart: null,
            sandbox: [],
            activeSince: Math.min(...others.map((d) => d.activeSince ?? Infinity)) || null,
          };
          if (base.activeSince === Infinity) base.activeSince = null;
        } else {
          setLoaded({ id: unitId, details: null, error: String(own.reason) });
          return;
        }
        const seen = new Set<number>();
        const processes = [
          ...(own.status === "fulfilled" ? own.value.processes : []),
          ...others.flatMap((d) => d.processes),
        ].filter((p) => !seen.has(p.pid) && !!seen.add(p.pid));
        setLoaded({
          id: unitId,
          details: { ...base, processes, scopes: (own.status === "fulfilled" ? 1 : 0) + others.length },
          error: null,
        });
      })
      .finally(() => {
        if (inFlight.current === unitId) inFlight.current = null;
      });
  }, [unit.id, unit.bus, unit.name, siblings, running, tick]);

  const mine = loaded?.id === unit.id ? loaded : null;
  return { details: mine?.details ?? null, error: mine?.error ?? null };
}
