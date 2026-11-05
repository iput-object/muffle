import { HugeiconsIcon } from "@hugeicons/react";
import { SquareLock02Icon } from "@hugeicons/core-free-icons";
import { cn } from "../utils/cn";
import { unitTitles } from "../utils/displayName";
import { formatBytes, formatCpu } from "../utils/format";
import { typeInfo, unitType } from "../utils/unitType";
import { UnitActions, type UnitActionsProps } from "./UnitActions";
import { UnitIcon } from "./UnitIcon";

export type { RowAction } from "./UnitActions";

type UnitRowProps = UnitActionsProps & {
  /** Its details are open. */
  selected: boolean;
  onOpen: () => void;
};

export const ROW_GRID = "grid-cols-[22px_minmax(0,1fr)_84px_64px_76px]";

export function UnitRow({ selected, onOpen, ...actions }: UnitRowProps) {
  const { unit, stopped, busy } = actions;
  const paused = unit.frozen && !stopped;
  const kind = unitType(unit);
  const type = typeInfo(kind);
  const { title, detail, detailIsId } = unitTitles(unit);
  // Actions that stay visible without hover: they describe the row's state.
  const pinned = busy || stopped || paused;

  return (
    <li
      data-flash-id={unit.id}
      data-unit-row
      onClick={onOpen}
      className={cn(
        "group grid h-12 cursor-pointer items-center gap-3 rounded-lg px-4 transition-colors",
        selected
          ? "bg-raised [--row:var(--color-raised)]"
          : "[--row:var(--color-bg)] hover:bg-surface hover:[--row:var(--color-surface)]",
        ROW_GRID,
      )}
    >
      <UnitIcon icon={unit.icon} name={title} type={kind} className={cn(stopped && "opacity-40")} />

      {/* Name cell; row actions slide in over its right end, so the numbers keep their place. */}
      <div className="relative min-w-0">
        <div className={cn("min-w-0", stopped && "opacity-45")}>
          <div className="flex items-center gap-1.5">
            {/* The keyboard way in; a click anywhere on the row lands in the same place. */}
            <button
              data-open
              aria-expanded={selected}
              aria-label={`${title}: show details`}
              title={title}
              className="min-w-0 cursor-pointer truncate rounded-sm text-left text-body text-fg"
            >
              {title}
            </button>
            {unit.protected && (
              <HugeiconsIcon icon={SquareLock02Icon} size={12} className="shrink-0 text-dim" aria-label="Protected" />
            )}
            {paused && (
              <span className="shrink-0 rounded px-1 text-footnote font-medium text-accent ring-1 ring-accent/30">
                paused
              </span>
            )}
            {stopped && (
              <span className="shrink-0 rounded px-1 text-footnote font-medium text-muted ring-1 ring-line">
                stopped
              </span>
            )}
          </div>
          <p
            className={cn("truncate text-subheadline text-muted", detailIsId && "font-mono text-[10.5px] text-dim")}
            title={unit.name}
          >
            {detail}
          </p>
        </div>

        {!unit.protected && (
          <div
            // Clicks on the actions (and the group menu) are theirs, not the row's.
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute inset-y-0 right-0 flex cursor-default items-center gap-0.5 bg-[linear-gradient(to_right,transparent,var(--row)_20px)] pl-7 transition-opacity",
              pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            )}
          >
            <UnitActions {...actions} />
          </div>
        )}
      </div>

      <span className={cn("flex items-center gap-1.5 text-callout text-muted", stopped && "opacity-45")}>
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", type.color)} />
        {type.short}
      </span>

      <span
        className={cn(
          "text-right text-callout tabular-nums",
          stopped ? "text-dim" : unit.cpu >= 10 ? "text-warn" : unit.cpu >= 1 ? "text-fg" : "text-dim",
        )}
      >
        {stopped ? "–" : formatCpu(unit.cpu)}
      </span>
      <span className={cn("text-right text-callout tabular-nums", stopped ? "text-dim" : "text-muted")}>
        {stopped ? "–" : formatBytes(unit.memBytes)}
      </span>
    </li>
  );
}
