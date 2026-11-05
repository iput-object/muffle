import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon, PauseIcon, PlayIcon, SquareLock02Icon, StopIcon } from "@hugeicons/core-free-icons";
import type { GroupView, Unit } from "../services/tauri";
import { cn } from "../utils/cn";
import { unitTitles } from "../utils/displayName";
import { formatBytes, formatCpu } from "../utils/format";
import { typeInfo, unitType } from "../utils/unitType";
import { AddToGroup } from "./AddToGroup";
import { IconButton } from "./ui/IconButton";
import { UnitIcon } from "./UnitIcon";

export type RowAction = "stop" | "start" | "pause" | "resume";

type UnitRowProps = {
  unit: Unit;
  /** Stopped by muffle this session: dimmed, offers Start. */
  stopped: boolean;
  busy: boolean;
  groups: GroupView[];
  onAction: (action: RowAction) => void;
  onAddToGroup: (group: GroupView) => void;
  onNewGroup: () => void;
};

export const ROW_GRID = "grid-cols-[22px_minmax(0,1fr)_84px_64px_76px]";

export function UnitRow({ unit, stopped, busy, groups, onAction, onAddToGroup, onNewGroup }: UnitRowProps) {
  const paused = unit.frozen && !stopped;
  const kind = unitType(unit);
  const type = typeInfo(kind);
  const { title, detail, detailIsId } = unitTitles(unit);
  // Actions that stay visible without hover: they describe the row's state.
  const pinned = busy || stopped || paused;

  return (
    <li
      data-flash-id={unit.id}
      className={cn(
        "group grid h-12 items-center gap-3 rounded-lg px-4 transition-colors [--row:var(--color-bg)] hover:bg-surface hover:[--row:var(--color-surface)]",
        ROW_GRID,
      )}
    >
      <UnitIcon icon={unit.icon} name={title} type={kind} className={cn(stopped && "opacity-40")} />

      {/* Name cell; row actions slide in over its right end, so the numbers keep their place. */}
      <div className="relative min-w-0">
        <div className={cn("min-w-0", stopped && "opacity-45")}>
          <div className="flex items-center gap-1.5">
            <span className="truncate text-body text-fg" title={title}>
              {title}
            </span>
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
            className={cn(
              "absolute inset-y-0 right-0 flex items-center gap-0.5 bg-[linear-gradient(to_right,transparent,var(--row)_20px)] pl-7 transition-opacity",
              pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            )}
          >
            {busy ? (
              <span className="flex h-7 w-7 items-center justify-center text-accent">
                <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
              </span>
            ) : stopped ? (
              <IconButton
                icon={PlayIcon}
                label="Start"
                onClick={() => onAction("start")}
                className="text-accent hover:bg-raised"
              />
            ) : (
              <>
                <AddToGroup unit={unit} groups={groups} onAdd={onAddToGroup} onNewGroup={onNewGroup} />
                {paused ? (
                  <IconButton
                    icon={PlayIcon}
                    label="Resume"
                    onClick={() => onAction("resume")}
                    className="text-accent hover:bg-raised"
                  />
                ) : (
                  <IconButton icon={PauseIcon} label="Pause" onClick={() => onAction("pause")} />
                )}
                <IconButton
                  icon={StopIcon}
                  label="Stop"
                  onClick={() => onAction("stop")}
                  className="text-muted hover:bg-danger/12 hover:text-danger"
                />
              </>
            )}
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
