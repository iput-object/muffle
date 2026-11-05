import { useEffect, useRef, useState, type ReactNode } from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import type { Unit } from "../../services/tauri";
import { useUnitDetails, type MergedDetails } from "../../hooks/useUnitDetails";
import { unitTitles } from "../../utils/displayName";
import { formatDuration } from "../../utils/format";
import { unitType } from "../../utils/unitType";
import { IconButton } from "../ui/IconButton";
import { Segmented } from "../ui/Segmented";
import { UnitActions, type UnitActionsProps } from "../UnitActions";
import { UnitIcon } from "../UnitIcon";
import { EmptyState } from "../Page";
import { Overview } from "./Overview";
import { Permissions } from "./Permissions";
import { Processes } from "./Processes";
import { MONO, StateDot, type StateTone } from "./parts";

type Tab = "overview" | "permissions" | "processes";

type DetailsPanelProps = UnitActionsProps & {
  /** Still in the latest snapshot. */
  running: boolean;
  /** Changes on every app refresh; details are re-read then. */
  tick: unknown;
  onClose: () => void;
};

const TYPE_NOUN = { app: "App", user: "User service", system: "System service" };

function stateOf(
  unit: Unit,
  running: boolean,
  stopped: boolean,
  d: MergedDetails | null,
): { tone: StateTone; text: string } {
  if (!running) return { tone: "off", text: stopped ? "Stopped" : "Ended" };
  if (unit.frozen) return { tone: "paused", text: "Paused" };
  switch (d?.activeState) {
    case "failed":
      return { tone: "bad", text: "Failed" };
    case "activating":
      return { tone: "warn", text: "Starting" };
    case "deactivating":
      return { tone: "warn", text: "Stopping" };
    case "reloading":
      return { tone: "warn", text: "Reloading" };
  }
  return { tone: "ok", text: "Running" };
}

/**
 * Everything about one unit, in a sheet over the right of the list. The list
 * stays usable beside it: clicking another row shows that one instead.
 */
export function DetailsPanel({ running, tick, onClose, ...actions }: DetailsPanelProps) {
  const { unit, stopped } = actions;
  const [tab, setTab] = useState<Tab>("overview");
  const { details, error } = useUnitDetails(unit, running, tick);
  const ref = useRef<HTMLElement>(null);
  const kind = unitType(unit);
  const { title } = unitTitles(unit);
  const state = stateOf(unit, running, stopped, details);
  // Closures below read the latest onClose without re-binding listeners.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Menus and dialogs take their Esc first (and mark it handled).
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      // Esc in a field elsewhere (the search) belongs to that field.
      const active = document.activeElement as HTMLElement | null;
      const editing = active?.matches("input, textarea, select, [contenteditable]:not([contenteditable=false])");
      if (editing && !ref.current?.contains(active)) return;
      close.current();
    };
    // Outside the sheet but inside the page: close. Rows switch instead; the
    // title bar, sidebar and dialogs (group editor) leave it be.
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (ref.current?.contains(t) || t.closest("[data-unit-row]") || !t.closest("main")) return;
      close.current();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  const since = running && details?.activeSince ? formatDuration(Date.now() - details.activeSince) : null;

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-label={`${title} details`}
      tabIndex={-1}
      className="sheet-in absolute inset-y-0 right-0 z-20 flex w-[520px] flex-col border-l border-line bg-bg shadow-[-24px_0_48px_-12px_rgb(0_0_0/0.55)] outline-none"
    >
      <header className="shrink-0 border-b border-line px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <UnitIcon
            icon={unit.icon}
            name={title}
            type={kind}
            size="lg"
            className={running ? undefined : "opacity-50"}
          />
          <div className="min-w-0 flex-1 pt-px">
            <h2 className="truncate text-title3 text-fg" title={title}>
              {title}
            </h2>
            <p className={`${MONO} truncate text-[10.5px] text-dim select-text`} title={unit.name}>
              {unit.name}
            </p>
            <p className="mt-2 flex min-w-0 items-center gap-1.5 text-callout text-muted">
              <StateDot tone={state.tone} />
              <span className={state.tone === "off" ? undefined : "text-fg"}>{state.text}</span>
              {since && <span title={new Date(details!.activeSince!).toLocaleString()}>for {since}</span>}
              <span aria-hidden className="text-dim">
                ·
              </span>
              <span className="truncate">{TYPE_NOUN[kind]}</span>
            </p>
          </div>
          <div className="-mt-0.5 -mr-2 flex shrink-0 items-center gap-0.5">
            {!unit.protected && (running || stopped) && (
              <>
                <UnitActions {...actions} />
                <span aria-hidden className="mx-1 h-4 w-px bg-line" />
              </>
            )}
            <IconButton icon={Cancel01Icon} label="Close details" onClick={onClose} />
          </div>
        </div>

        {running && details && (
          <Segmented<Tab>
            tabsFor="details"
            value={tab}
            onChange={setTab}
            className="mt-4 bg-surface [&>button]:flex-1"
            options={[
              { value: "overview", label: "Overview" },
              { value: "permissions", label: "Permissions" },
              {
                value: "processes",
                label: (
                  <>
                    Processes <span className="ml-0.5 text-dim">{details.processes.length}</span>
                  </>
                ),
              },
            ]}
          />
        )}
      </header>

      <div
        id="details-panel"
        role={running && details ? "tabpanel" : undefined}
        aria-labelledby={running && details ? `details-tab-${tab}` : undefined}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]"
      >
        {!running ? (
          <Gone stopped={stopped} />
        ) : details ? (
          tab === "overview" ? (
            <Overview unit={unit} details={details} title={title} />
          ) : tab === "permissions" ? (
            <Permissions details={details} />
          ) : (
            <Processes details={details} mainUser={details.user} />
          )
        ) : error ? (
          <Note title="Couldn't read its details">
            <span className={`${MONO} break-words text-muted select-text`}>{error}</span>
          </Note>
        ) : (
          <p className="pt-10 text-center text-callout text-dim">Loading…</p>
        )}
      </div>
    </aside>
  );
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <EmptyState title={title}>
      <span className="block max-w-[40ch]">{children}</span>
    </EmptyState>
  );
}

function Gone({ stopped }: { stopped: boolean }) {
  return (
    <Note title="No longer running">
      {stopped
        ? "You stopped it from muffle. Start it again with the play button above."
        : "It stopped or was closed. If it comes back, its details show up here again."}
    </Note>
  );
}
