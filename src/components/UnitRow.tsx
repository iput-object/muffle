import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon, PauseIcon, PlayIcon, SquareLock02Icon, StopIcon } from "@hugeicons/core-free-icons";
import type { GroupView, Unit } from "../services/tauri";
import { cn } from "../utils/cn";
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

export const ROW_GRID = "grid-cols-[20px_1fr_76px_56px_72px_92px]";

export function UnitRow({ unit, stopped, busy, groups, onAction, onAddToGroup, onNewGroup }: UnitRowProps) {
  const paused = unit.frozen && !stopped;
  const type = typeInfo(unitType(unit));

  return (
    <li
      className={cn(
        "group grid items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface",
        ROW_GRID,
        stopped && "opacity-45",
      )}
    >
      <UnitIcon icon={unit.icon} />

      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-body text-fg">{unit.label}</span>
          {paused && (
            <span className="shrink-0 rounded px-1 text-footnote font-medium text-accent ring-1 ring-accent/30">paused</span>
          )}
        </div>
        <p className="truncate text-subheadline text-muted" title={unit.name}>
          {unit.kind === "app" || !unit.description ? unit.name : unit.description}
        </p>
      </div>

      <span className="flex items-center gap-1.5 text-callout text-muted">
        <span className={cn("h-2 w-2 shrink-0 rounded-sm", type.color)} />
        {type.short}
      </span>

      <span
        className={cn(
          "text-right text-callout tabular-nums",
          unit.cpu >= 10 ? "text-warn" : unit.cpu >= 1 ? "text-fg" : "text-dim",
        )}
      >
        {stopped ? "–" : formatCpu(unit.cpu)}
      </span>
      <span className="text-right text-callout tabular-nums text-muted">
        {stopped ? "–" : formatBytes(unit.memBytes)}
      </span>

      <div className="flex items-center justify-end gap-0.5">
        {unit.protected ? (
          <span className="flex h-7 w-7 items-center justify-center text-dim" title="Protected">
            <HugeiconsIcon icon={SquareLock02Icon} size={14} aria-label="Protected" />
          </span>
        ) : busy ? (
          <span className="flex h-7 w-7 items-center justify-center text-accent">
            <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
          </span>
        ) : stopped ? (
          <IconButton icon={PlayIcon} label="Start" onClick={() => onAction("start")} className="text-accent hover:bg-raised" />
        ) : (
          <>
            <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <AddToGroup unit={unit} groups={groups} onAdd={onAddToGroup} onNewGroup={onNewGroup} />
              {!paused && (
                <IconButton icon={PauseIcon} label="Pause" onClick={() => onAction("pause")} />
              )}
              <IconButton
                icon={StopIcon}
                label="Stop"
                onClick={() => onAction("stop")}
                className="text-muted hover:bg-raised hover:text-danger"
              />
            </div>
            {paused && (
              <IconButton icon={PlayIcon} label="Resume" onClick={() => onAction("resume")} className="text-accent hover:bg-raised" />
            )}
          </>
        )}
      </div>
    </li>
  );
}
