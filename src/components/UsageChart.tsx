import { useState } from "react";
import type { Snapshot } from "../services/tauri";
import { cn } from "../utils/cn";
import { formatBytes, formatCpu } from "../utils/format";
import { UNIT_TYPES, unitType, type UnitType } from "../utils/unitType";
import { Segmented } from "./ui/Segmented";

type Metric = "mem" | "cpu";

const METRICS: { value: Metric; label: string }[] = [
  { value: "mem", label: "Memory" },
  { value: "cpu", label: "CPU" },
];

type Segment = { key: UnitType | "other"; label: string; color: string; value: number };

type UsageChartProps = {
  snapshot: Snapshot;
  /** The Type filter, highlighted here; clicking a legend item sets it. */
  filter: UnitType | null;
  onFilter: (type: UnitType | null) => void;
};

/**
 * One stacked bar of the whole machine: what each unit type uses, what the rest
 * of the system uses ("Other"), and the free part as the empty track.
 */
export function UsageChart({ snapshot, filter, onFilter }: UsageChartProps) {
  const [metric, setMetric] = useState<Metric>("mem");
  const [hover, setHover] = useState<Segment["key"] | null>(null);

  const total = metric === "mem" ? snapshot.memTotal : 100;
  const used = metric === "mem" ? snapshot.memUsed : snapshot.cpu;
  const format = (v: number) => (metric === "mem" ? formatBytes(v) : formatCpu(v));

  const segments: Segment[] = UNIT_TYPES.map((t) => ({
    key: t.value,
    label: t.label,
    color: t.color,
    value: snapshot.units
      .filter((u) => unitType(u) === t.value)
      .reduce((sum, u) => sum + (metric === "mem" ? u.memBytes : u.cpu), 0),
  }));
  const counted = segments.reduce((sum, s) => sum + s.value, 0);
  segments.push({ key: "other", label: "Other", color: "bg-muted/40", value: Math.max(0, used - counted) });

  // Never draw past the track, even if per-unit numbers overshoot the total.
  const scale = 1 / Math.max(total, used, counted, 1);
  const focus = hover ?? filter;
  const focused = segments.find((s) => s.key === focus);

  return (
    <section className="rounded-lg bg-surface p-4 ring-1 ring-line">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-title3 tabular-nums">{format(focused ? focused.value : used)}</span>
          <span className="text-subheadline text-muted">
            {focused
              ? `${focused.label} · ${Math.round((focused.value / total) * 100)}% of ${format(total)}`
              : `used of ${format(total)}`}
          </span>
        </div>
        <Segmented className="bg-bg" options={METRICS} value={metric} onChange={setMetric} />
      </div>

      <div
        className="flex h-3 gap-0.5 overflow-hidden rounded bg-raised"
        role="img"
        aria-label={segments.map((s) => `${s.label} ${format(s.value)}`).join(", ")}
        onMouseLeave={() => setHover(null)}
      >
        {segments.map((s) =>
          s.value * scale > 0.002 ? (
            <div
              key={s.key}
              onMouseEnter={() => setHover(s.key)}
              className={cn(
                "h-full transition-[width,opacity] duration-500",
                s.color,
                focus && focus !== s.key && "opacity-30",
              )}
              style={{ width: `${s.value * scale * 100}%` }}
            />
          ) : null,
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {segments.map((s) => {
          const clickable = s.key !== "other";
          return (
            <button
              key={s.key}
              disabled={!clickable}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => clickable && onFilter(filter === s.key ? null : (s.key as UnitType))}
              className={cn(
                "flex items-center gap-1.5 rounded text-subheadline transition-opacity disabled:cursor-default",
                filter && filter !== s.key && "opacity-50",
              )}
            >
              <span className={cn("h-2 w-2 rounded-sm", s.color)} />
              <span className="text-muted">{s.label}</span>
              <span className="tabular-nums text-fg">{format(s.value)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
