import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon, PauseIcon, PlayIcon, StopIcon } from "@hugeicons/core-free-icons";
import type { GroupView, Unit } from "../services/tauri";
import { AddToGroup } from "./AddToGroup";
import { IconButton } from "./ui/IconButton";

export type RowAction = "stop" | "start" | "pause" | "resume";

export type UnitActionsProps = {
  unit: Unit;
  /** Stopped by muffle this session: offers Start. */
  stopped: boolean;
  busy: boolean;
  groups: GroupView[];
  onAction: (action: RowAction) => void;
  onAddToGroup: (group: GroupView) => void;
  onNewGroup: () => void;
};

/** Add to group, pause/resume and stop, or Start for a stopped unit. Same set on a row and in details. */
export function UnitActions({ unit, stopped, busy, groups, onAction, onAddToGroup, onNewGroup }: UnitActionsProps) {
  const paused = unit.frozen && !stopped;
  if (busy) {
    return (
      <span className="flex h-7 w-7 items-center justify-center text-accent">
        <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
      </span>
    );
  }
  if (stopped) {
    return (
      <IconButton
        icon={PlayIcon}
        label="Start"
        onClick={() => onAction("start")}
        className="text-accent hover:bg-raised"
      />
    );
  }
  return (
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
  );
}
