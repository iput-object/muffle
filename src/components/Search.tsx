import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Cancel01Icon, Layers01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import type { GroupView, Startup, Unit } from "../services/tauri";
import { cn } from "../utils/cn";
import { formatBytes, formatCpu } from "../utils/format";
import { search, type Hit, type HitKind } from "../utils/search";
import { unitType } from "../utils/unitType";
import { UnitIcon } from "./UnitIcon";

/** Rows shown per section before "Show all". */
const CAP = 5;

const SECTIONS: { kind: HitKind; label: string }[] = [
  { kind: "running", label: "Running" },
  { kind: "group", label: "Groups" },
  { kind: "startup", label: "Startup" },
];

type SearchProps = {
  value: string;
  onChange: (value: string) => void;
  /** Bumped by the Ctrl+F shortcut to open and focus the field. */
  focusSignal: number;
  units: Unit[];
  groups: GroupView[];
  /** Startup items, loaded lazily the first time the field opens. */
  startup: Startup | null;
  onOpen: () => void;
  onPick: (hit: Hit) => void;
  onShowAll: (kind: HitKind) => void;
};

/** One row of the results list: a hit, or a "Show all" link for a section. */
type Row = { type: "hit"; hit: Hit } | { type: "more"; kind: HitKind; total: number };

/**
 * The title-bar search: a field that expands from an icon, with results from
 * Running, Groups and Startup in a panel underneath. Arrow keys move, Enter opens,
 * Escape clears and closes.
 */
export function Search({
  value,
  onChange,
  focusSignal,
  units,
  groups,
  startup,
  onOpen,
  onPick,
  onShowAll,
}: SearchProps) {
  const [expanded, setExpanded] = useState(value !== "");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const open = expanded || value !== "";

  useEffect(() => {
    if (expanded) input.current?.focus();
  }, [expanded]);

  useEffect(() => {
    if (!focusSignal) return;
    setExpanded(true);
    input.current?.focus();
    input.current?.select();
  }, [focusSignal]);

  useEffect(() => {
    if (focused) onOpen();
  }, [focused, onOpen]);

  const results = useMemo(() => search(value, { units, groups, startup }), [value, units, groups, startup]);

  const sections = SECTIONS.map((s) => ({ ...s, hits: results[s.kind] })).filter((s) => s.hits.length);
  const rows: Row[] = sections.flatMap((s) => [
    ...s.hits.slice(0, CAP).map((hit): Row => ({ type: "hit", hit })),
    ...(s.hits.length > CAP ? [{ type: "more", kind: s.kind, total: s.hits.length } as Row] : []),
  ]);
  const panel = focused && value.trim() !== "";

  // A new query starts at the top.
  useEffect(() => setActive(0), [value]);

  useEffect(() => {
    list.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function close() {
    onChange("");
    setExpanded(false);
    input.current?.blur();
  }

  function choose(row: Row | undefined) {
    if (!row) return;
    setExpanded(false);
    input.current?.blur();
    if (row.type === "hit") onPick(row.hit);
    else onShowAll(row.kind);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown" && rows.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp" && rows.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[active]);
    }
  }

  let index = 0;

  return (
    <div className="relative">
      <div
        className={cn(
          "flex h-7 items-center overflow-hidden rounded-md transition-[width,background-color] duration-200",
          open ? "w-64 bg-surface ring-1 ring-line focus-within:ring-accent/40" : "w-7",
        )}
      >
        <button
          onClick={() => (open ? input.current?.focus() : setExpanded(true))}
          aria-label="Search"
          title="Search (Ctrl F)"
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
            open ? "text-dim" : "text-muted hover:bg-raised hover:text-fg",
          )}
        >
          <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={2} />
        </button>
        {open && (
          <>
            <input
              ref={input}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                if (value === "") setExpanded(false);
              }}
              placeholder="Search everything"
              role="combobox"
              aria-expanded={panel}
              aria-controls="search-results"
              aria-activedescendant={panel && rows.length ? `search-row-${active}` : undefined}
              className="min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-dim"
            />
            {value && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={close}
                aria-label="Clear search"
                className="flex h-7 w-7 shrink-0 items-center justify-center text-dim hover:text-fg"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
              </button>
            )}
          </>
        )}
      </div>

      {panel && (
        <div
          id="search-results"
          role="listbox"
          // Clicks inside keep the field focused, so the panel stays until a choice is made.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-9 right-0 z-50 flex max-h-[468px] w-[440px] flex-col overflow-hidden rounded-xl bg-surface shadow-[0_16px_48px_rgb(0_0_0/0.55)] ring-1 ring-white/10"
        >
          <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {sections.length === 0 ? (
              <p className="px-3 py-8 text-center text-callout text-muted">
                No matches for “<span className="text-fg">{value.trim()}</span>”
              </p>
            ) : (
              sections.map((s) => (
                <div key={s.kind} className="mb-1 last:mb-0">
                  <div className="flex items-center justify-between px-2.5 pt-2 pb-1 text-subheadline">
                    <span className="font-medium text-muted">{s.label}</span>
                    <span className="tabular-nums text-dim">{s.hits.length}</span>
                  </div>
                  {s.hits.slice(0, CAP).map((hit) => {
                    const i = index++;
                    return (
                      <ResultRow
                        key={hit.key}
                        i={i}
                        active={i === active}
                        query={value.trim()}
                        hit={hit}
                        onHover={() => setActive(i)}
                        onClick={() => choose({ type: "hit", hit })}
                      />
                    );
                  })}
                  {s.hits.length > CAP &&
                    (() => {
                      const i = index++;
                      return (
                        <button
                          id={`search-row-${i}`}
                          data-row={i}
                          role="option"
                          aria-selected={i === active}
                          onMouseMove={() => setActive(i)}
                          onClick={() => choose({ type: "more", kind: s.kind, total: s.hits.length })}
                          className={cn(
                            "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-callout",
                            i === active ? "bg-raised text-fg" : "text-muted",
                          )}
                        >
                          <span className="flex w-[22px] justify-center">
                            <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
                          </span>
                          Show all {s.hits.length} in {s.label}
                        </button>
                      );
                    })()}
                </div>
              ))
            )}
          </div>

          {rows.length > 0 && (
            <div className="flex h-8 shrink-0 items-center gap-4 border-t border-line px-3 text-footnote text-dim">
              <Hint keys={["↑", "↓"]}>to move</Hint>
              <Hint keys={["↵"]}>to open</Hint>
              <Hint keys={["Esc"]}>to close</Hint>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Hint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd key={k} className="min-w-4 rounded bg-raised px-1 py-px text-center font-sans text-muted ring-1 ring-line">
          {k}
        </kbd>
      ))}
      <span className="ml-0.5">{children}</span>
    </span>
  );
}

function ResultRow({
  i,
  active,
  query,
  hit,
  onHover,
  onClick,
}: {
  i: number;
  active: boolean;
  query: string;
  hit: Hit;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <button
      id={`search-row-${i}`}
      data-row={i}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onClick}
      className={cn("flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left", active && "bg-raised")}
    >
      {hit.kind === "group" ? (
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-accent/12 text-accent ring-1 ring-accent/25 ring-inset">
          <HugeiconsIcon icon={Layers01Icon} size={13} strokeWidth={1.8} />
        </span>
      ) : hit.kind === "running" ? (
        <UnitIcon icon={hit.unit.icon} name={hit.title} type={unitType(hit.unit)} />
      ) : (
        <UnitIcon
          icon={hit.item.icon}
          name={hit.title}
          type={unitType(hit.item)}
          className={cn(!hit.item.enabled && "opacity-50 grayscale")}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-fg">
          <Highlight text={hit.title} query={query} />
        </span>
        <span className="block truncate text-subheadline text-muted">{hit.detail}</span>
      </span>
      <span className="shrink-0 text-subheadline tabular-nums">
        <State hit={hit} />
      </span>
    </button>
  );
}

function State({ hit }: { hit: Hit }) {
  if (hit.kind === "running") {
    if (hit.unit.frozen) return <span className="text-accent">Paused</span>;
    return (
      <span className="text-dim">
        {formatCpu(hit.unit.cpu)} · {formatBytes(hit.unit.memBytes)}
      </span>
    );
  }
  if (hit.kind === "group") {
    if (hit.group.muffled) return <span className="text-accent">Muffled</span>;
    const n = hit.group.units.length;
    return (
      <span className="text-dim">
        {n} member{n === 1 ? "" : "s"}
      </span>
    );
  }
  return hit.item.enabled ? <span className="text-muted">On</span> : <span className="text-dim">Off</span>;
}

/** The first match in the title, set in the accent. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="text-accent">{text.slice(at, at + query.length)}</span>
      {text.slice(at + query.length)}
    </>
  );
}
