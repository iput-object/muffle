import { useMemo, useState } from "react";
import { api, unitRef, type Group, type GroupView, type Snapshot, type Unit } from "../services/tauri";
import { cn } from "../utils/cn";
import type { Notify } from "../components/StatusBar";
import { Empty, Page } from "../components/Page";
import { ROW_GRID, UnitRow, type RowAction } from "../components/UnitRow";
import { TypeFilter } from "../components/TypeFilter";
import { UsageChart } from "../components/UsageChart";
import { unitType, type UnitType } from "../utils/unitType";

type RunningProps = {
  snapshot: Snapshot | null;
  refresh: () => void;
  notify: Notify;
  onEditGroup: (group: Group) => void;
  /** Search text from the title bar. */
  query: string;
};

export default function Running({ snapshot, refresh, notify, onEditGroup, query }: RunningProps) {
  const [filter, setFilter] = useState<UnitType | null>(null);
  const [showProtected, setShowProtected] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  /** Units stopped from here this session, kept so they can be started again. */
  const [stopped, setStopped] = useState<Map<string, Unit>>(new Map());

  const running = snapshot?.units ?? [];
  const groups = snapshot?.groups ?? [];
  const byId = useMemo(() => new Map(running.map((u) => [u.id, u])), [running]);
  // Anything that came back on its own is no longer "stopped".
  const stoppedList = [...stopped.values()].filter((u) => !byId.has(u.id));

  // Everything the search allows, before the Type filter, so the filter menu can count it.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return running.filter(
      (u) =>
        (showProtected || !u.protected) &&
        (!q || u.label.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)),
    );
  }, [running, query, showProtected]);
  const visible = filter ? searched.filter((u) => unitType(u) === filter) : searched;
  const typeCounts = { app: 0, user: 0, system: 0 };
  for (const u of searched) typeCounts[unitType(u)]++;

  const protectedCount = running.filter((u) => u.protected).length;

  async function act(unit: Unit, action: RowAction) {
    setBusy((s) => new Set(s).add(unit.id));
    try {
      if (action === "stop") {
        await api.stopUnit(unit);
        setStopped((m) => new Map(m).set(unit.id, unit));
      } else if (action === "start") {
        await api.startUnit(unit);
        setStopped((m) => {
          const next = new Map(m);
          next.delete(unit.id);
          return next;
        });
      } else if (action === "pause") {
        await api.pauseUnit(unit);
      } else {
        await api.resumeUnit(unit);
      }
      refresh();
    } catch (e) {
      notify(`${unit.label}: ${e}`, "error");
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(unit.id);
        return next;
      });
    }
  }

  async function addToGroup(unit: Unit, group: GroupView) {
    try {
      await api.addToGroup(group.id, unitRef(unit));
      notify(`Added ${unit.label} to ${group.name}`);
      refresh();
    } catch (e) {
      notify(String(e), "error");
    }
  }

  const rowProps = (unit: Unit) => ({
    unit,
    groups,
    busy: busy.has(unit.id),
    onAction: (action: RowAction) => act(unit, action),
    onAddToGroup: (group: GroupView) => addToGroup(unit, group),
    onNewGroup: () => onEditGroup({ id: "", name: "", mode: "stop", units: [unitRef(unit)] }),
  });

  return (
    <Page className="pt-0">
      {snapshot && (
        <div className="pt-4 pb-3">
          <UsageChart snapshot={snapshot} filter={filter} onFilter={setFilter} />
        </div>
      )}

      {/* Inside the scroller so it shares the rows' grid, padding and scrollbar gutter. */}
      <div
        className={cn(
          "sticky top-0 z-10 -mx-3 grid gap-3 border-b border-line bg-bg px-3 py-1.5 text-subheadline text-muted",
          ROW_GRID,
        )}
      >
        <span className="col-span-2">Name</span>
        <TypeFilter
          value={filter}
          onChange={setFilter}
          counts={typeCounts}
          showProtected={showProtected}
          onShowProtected={setShowProtected}
          protectedCount={protectedCount}
        />
        <span className="text-right">CPU</span>
        <span className="text-right">Memory</span>
        <span />
      </div>

      {!snapshot ? (
        <Empty>Loading…</Empty>
      ) : visible.length === 0 && stoppedList.length === 0 ? (
        <Empty>Nothing matches.</Empty>
      ) : (
        <ul className="-mx-3 pt-1">
          {stoppedList.map((unit) => (
            <UnitRow key={unit.id} stopped {...rowProps(unit)} />
          ))}
          {visible.map((unit) => (
            <UnitRow key={unit.id} stopped={false} {...rowProps(unit)} />
          ))}
        </ul>
      )}
    </Page>
  );
}
