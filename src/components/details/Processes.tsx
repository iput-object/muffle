import { useMemo, useState } from "react";
import type { ProcessInfo } from "../../services/tauri";
import type { MergedDetails } from "../../hooks/useUnitDetails";
import { cn } from "../../utils/cn";
import { formatBytes, formatTime } from "../../utils/format";
import { Button } from "../ui/Button";
import { Copyable, Tag } from "./parts";

const GRID = "grid-cols-[48px_minmax(0,1fr)_64px_60px_44px_56px]";
const CAP = 100;

/** "S (sleeping)" → "Sleeping", with a colour for the ones worth noticing. */
function stateWord(state: string): { word: string; className: string } {
  switch (state[0]) {
    case "R":
      return { word: "Running", className: "text-fg" };
    case "S":
      return { word: "Sleeping", className: "text-muted" };
    case "I":
      return { word: "Idle", className: "text-muted" };
    case "D":
      return { word: "Disk wait", className: "text-warn" };
    case "T":
    case "t":
      return { word: "Stopped", className: "text-accent" };
    case "Z":
      return { word: "Zombie", className: "text-danger" };
    default:
      return { word: state || "–", className: "text-muted" };
  }
}

/**
 * A short hint to tell twenty "chrome" processes apart: the Chromium/Electron
 * role when there is one ("renderer", "NetworkService"), else the arguments.
 */
function hint(p: ProcessInfo): string {
  const cmd = p.cmdline.trim();
  const sub = cmd.match(/--utility-sub-type=(?:[\w.]+\.)?(\w+)/);
  if (sub) return sub[1];
  const type = cmd.match(/--type=([\w-]+)/);
  if (type) return cmd.includes("--extension-process") ? "extension" : type[1];
  // Drop the program itself (a path, or a retitled "name: status" line keeps its status).
  const first = cmd.split(" ", 1)[0];
  return cmd.slice(first.length).trim();
}

type Row = { p: ProcessInfo; depth: number };

/** Parent before children, siblings by memory (their whole subtree), heaviest first. */
function tree(processes: ProcessInfo[]): Row[] {
  const pids = new Set(processes.map((p) => p.pid));
  const kids = new Map<number, ProcessInfo[]>();
  const roots: ProcessInfo[] = [];
  for (const p of processes) {
    if (p.ppid !== p.pid && pids.has(p.ppid)) {
      const list = kids.get(p.ppid) ?? [];
      list.push(p);
      kids.set(p.ppid, list);
    } else roots.push(p);
  }
  const weight = new Map<number, number>();
  const total = (p: ProcessInfo, seen = new Set<number>()): number => {
    if (weight.has(p.pid)) return weight.get(p.pid)!;
    seen.add(p.pid);
    const w =
      p.rssBytes + (kids.get(p.pid) ?? []).filter((k) => !seen.has(k.pid)).reduce((n, k) => n + total(k, seen), 0);
    weight.set(p.pid, w);
    return w;
  };
  const byWeight = (a: ProcessInfo, b: ProcessInfo) => total(b) - total(a) || a.pid - b.pid;

  const out: Row[] = [];
  const visited = new Set<number>();
  const walk = (p: ProcessInfo, depth: number) => {
    if (visited.has(p.pid)) return;
    visited.add(p.pid);
    out.push({ p, depth });
    for (const k of (kids.get(p.pid) ?? []).sort(byWeight)) walk(k, depth + 1);
  };
  roots.sort(byWeight).forEach((r) => walk(r, 0));
  // Anything caught in a parent loop still gets listed.
  for (const p of processes) if (!visited.has(p.pid)) out.push({ p, depth: 0 });
  return out;
}

export function Processes({ details, mainUser }: { details: MergedDetails; mainUser: string | null }) {
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const rows = useMemo(() => tree(details.processes), [details.processes]);
  const shown = showAll ? rows : rows.slice(0, CAP);
  const total = details.processes.reduce((n, p) => n + p.rssBytes, 0);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-callout text-muted">No processes in this unit right now.</p>;
  }

  return (
    <>
      <p className="mb-2 text-subheadline text-muted tabular-nums">
        {rows.length} {rows.length === 1 ? "process" : "processes"} · {formatBytes(total)}
        {details.scopes > 1 && <> · from {details.scopes} scopes of this app</>}
      </p>

      <div
        aria-hidden
        className={cn(
          "sticky -top-4 z-10 -mx-2 grid gap-2 border-b border-line bg-bg px-2 py-2 text-subheadline text-muted",
          GRID,
        )}
      >
        <span>PID</span>
        <span>Name</span>
        <span>User</span>
        <span>State</span>
        <span className="text-right">Threads</span>
        <span className="text-right">Memory</span>
      </div>

      <ul className="-mx-2 pt-1">
        {shown.map(({ p, depth }) => {
          const expanded = open === p.pid;
          const state = stateWord(p.state);
          const rest = hint(p);
          return (
            <li key={p.pid}>
              <button
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : p.pid)}
                title={p.cmdline || p.name}
                className={cn(
                  "grid h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left transition-colors",
                  expanded ? "bg-surface" : "hover:bg-surface",
                  GRID,
                )}
              >
                <span className="text-callout text-dim tabular-nums">{p.pid}</span>
                <span className="flex min-w-0 items-center">
                  {depth > 0 && (
                    <span
                      aria-hidden
                      style={{ marginLeft: (Math.min(depth, 5) - 1) * 10 }}
                      className="mr-1.5 mb-1 h-[7px] w-[7px] shrink-0 rounded-bl-[2px] border-b border-l border-white/20"
                    />
                  )}
                  <span className="shrink-0 truncate text-body text-fg">{p.name}</span>
                  {rest && <span className="ml-1.5 min-w-0 truncate text-callout text-dim">{rest}</span>}
                </span>
                <span
                  className={cn(
                    "truncate text-callout",
                    p.user === "root" && p.user !== mainUser ? "text-warn" : "text-muted",
                  )}
                >
                  {p.user}
                </span>
                <span className={cn("truncate text-callout", state.className)}>{state.word}</span>
                <span className="text-right text-callout text-muted tabular-nums">{p.threads}</span>
                <span className="text-right text-callout text-muted tabular-nums">
                  {p.rssBytes ? formatBytes(p.rssBytes) : "–"}
                </span>
              </button>

              {expanded && (
                <div className="mt-px mb-1.5 flex flex-col gap-2 rounded-md bg-surface px-3 py-2.5 select-text">
                  {p.cmdline ? (
                    <Copyable text={p.cmdline} />
                  ) : (
                    <span className="text-callout text-muted">No command line (kernel thread)</span>
                  )}
                  <p className="text-subheadline text-muted tabular-nums">
                    {p.started && <>Started {formatTime(p.started)} · </>}
                    Parent <span className="font-mono">{p.ppid}</span> · Group{" "}
                    <span className="font-mono">{p.group}</span>
                  </p>
                  {p.allCapabilities ? (
                    <p className="text-subheadline text-muted">All capabilities</p>
                  ) : (
                    p.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {p.capabilities.map((c) => (
                          <Tag key={c} mono title={c}>
                            {c.replace(/^CAP_/, "")}
                          </Tag>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {rows.length > CAP && (
        <div className="mt-2 flex justify-center">
          <Button variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Show the first ${CAP}` : `Show all ${rows.length}`}
          </Button>
        </div>
      )}
    </>
  );
}
