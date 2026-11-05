import { useEffect, useState } from "react";
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

/** Cells in the meter; each one is 1/CELLS of the machine. */
const CELLS = 72;
/** Samples kept for the history line (one per refresh). */
const HISTORY = 60;

type Segment = { key: UnitType | "other"; label: string; color: string; value: number };

type UsageChartProps = {
  snapshot: Snapshot;
  /** The Type filter, highlighted here; clicking a legend item sets it. */
  filter: UnitType | null;
  onFilter: (type: UnitType | null) => void;
};

/**
 * The whole machine as a row of cells, coloured by what each unit type uses, with
 * the rest of the system as "Other" and free capacity left as empty cells. A
 * short history line sits beside the total.
 */
export function UsageChart({ snapshot, filter, onFilter }: UsageChartProps) {
  const [metric, setMetric] = useState<Metric>("mem");
  const [hover, setHover] = useState<Segment["key"] | null>(null);
  const history = useHistory(snapshot);

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
  segments.push({ key: "other", label: "Other", color: "bg-muted/45", value: Math.max(0, used - counted) });

  const cells = toCells(segments, Math.max(total, used, counted, 1));
  const focus = hover ?? filter;
  const focused = segments.find((s) => s.key === focus);
  const shown = focused ? focused.value : used;

  return (
    <section className="rounded-xl bg-surface p-4 ring-1 ring-line">
      <div className="mb-3.5 flex items-center gap-4">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="text-title2 tabular-nums">{format(shown)}</span>
          <span className="truncate text-subheadline text-muted">
            {focused ? `${focused.label} · ` : "used · "}
            <span className="tabular-nums">{Math.round((shown / total) * 100)}%</span> of {format(total)}
          </span>
        </div>
        <Sparkline values={history[metric]} />
        <Segmented className="bg-bg" options={METRICS} value={metric} onChange={setMetric} />
      </div>

      <div
        className="grid h-5 gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${CELLS}, minmax(0, 1fr))` }}
        role="img"
        aria-label={segments.map((s) => `${s.label} ${format(s.value)}`).join(", ")}
        onMouseLeave={() => setHover(null)}
      >
        {cells.map((seg, i) => (
          <div
            key={i}
            onMouseEnter={() => setHover(seg?.key ?? null)}
            className={cn(
              "rounded-[2px] transition-[background-color,opacity] duration-300",
              seg ? seg.color : "bg-raised",
              seg && focus && focus !== seg.key && "opacity-25",
            )}
          />
        ))}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1">
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
              <span className={cn("h-2 w-2 rounded-[2px]", s.color)} />
              <span className="text-muted">{s.label}</span>
              <span className="tabular-nums text-fg">{format(s.value)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Whole cells per segment (largest remainder), so anything visible gets at least one. */
function toCells(segments: Segment[], scale: number): (Segment | null)[] {
  const exact = segments.map((s) => (s.value / scale) * CELLS);
  const counts = exact.map((x) => (x > 0.25 ? Math.max(1, Math.floor(x)) : 0));
  const budget = Math.min(CELLS, Math.round(exact.reduce((a, b) => a + b, 0)));
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; counts.reduce((a, b) => a + b, 0) < budget && k < order.length; k++) counts[order[k][1]]++;
  const out: (Segment | null)[] = [];
  segments.forEach((s, i) => {
    for (let n = 0; n < counts[i] && out.length < CELLS; n++) out.push(s);
  });
  while (out.length < CELLS) out.push(null);
  return out;
}

/** Memory and CPU totals from recent snapshots, newest last. */
function useHistory(snapshot: Snapshot) {
  const [history, setHistory] = useState<Record<Metric, number[]>>({ mem: [], cpu: [] });
  useEffect(() => {
    setHistory((h) => ({
      mem: [...h.mem, snapshot.memUsed].slice(-HISTORY),
      cpu: [...h.cpu, snapshot.cpu].slice(-HISTORY),
    }));
  }, [snapshot]);
  return history;
}

const W = 120;
const H = 28;

/** Recent totals, auto-ranged so small swings stay visible (like Activity Monitor's graphs). */
function Sparkline({ values }: { values: number[] }) {
  // A few samples in, so the first refreshes don't draw a stray dot.
  if (values.length < 4) return <div style={{ width: W, height: H }} aria-hidden />;
  const top = Math.max(...values);
  const bottom = Math.min(...values);
  const pad = Math.max((top - bottom) * 0.25, top * 0.02, 1e-9);
  const lo = Math.max(0, bottom - pad);
  const hi = top + pad;
  // Fill the width from the right as samples arrive, like a scrolling monitor.
  const step = W / (HISTORY - 1);
  const x0 = W - (values.length - 1) * step;
  const y = (v: number) => H - 2 - ((v - lo) / (hi - lo)) * (H - 4);
  const line = values.map((v, i) => `${i ? "L" : "M"}${(x0 + i * step).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${W},${H}L${x0.toFixed(1)},${H}Z`;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="shrink-0 overflow-visible"
      aria-label="Recent history"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgb(255 255 255 / 0.06)" strokeDasharray="2 3" />
      <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="rgb(255 255 255 / 0.08)" />
      <path d={area} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="1.25" strokeLinejoin="round" />
      <circle cx={W} cy={y(values[values.length - 1])} r="2" fill="var(--color-accent)" />
    </svg>
  );
}
