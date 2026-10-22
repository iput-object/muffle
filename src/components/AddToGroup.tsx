import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconButton } from "./ui/IconButton";
import { Add01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { GroupView, Unit } from "../services/tauri";

type AddToGroupProps = {
  unit: Unit;
  groups: GroupView[];
  onAdd: (group: GroupView) => void;
  onNewGroup: () => void;
};

/** ＋ button on a row: pick a group to add this unit to, or start a new one. */
export function AddToGroup({ unit, groups, onAdd, onNewGroup }: AddToGroupProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const inGroup = (g: GroupView) => g.units.some((u) => u.bus === unit.bus && u.name === unit.name);

  return (
    <div ref={ref} className="relative">
      <IconButton
        icon={Add01Icon}
        label="Add to group"
        onClick={() => setOpen((v) => !v)}
        className="text-muted hover:bg-raised hover:text-accent"
      />
      {open && (
        <div className="absolute top-8 right-0 z-30 w-48 rounded-lg bg-raised p-1 shadow-xl ring-1 ring-line">
          {groups.map((g) => (
            <button
              key={g.id}
              disabled={inGroup(g)}
              onClick={() => {
                onAdd(g);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 h-7 rounded-md px-2 text-left text-body text-fg hover:bg-surface disabled:text-dim disabled:hover:bg-transparent"
            >
              <span className="truncate">{g.name}</span>
              {inGroup(g) && <HugeiconsIcon icon={Tick02Icon} size={11} />}
            </button>
          ))}
          {groups.length > 0 && <div className="my-1 h-px bg-line" />}
          <button
            onClick={() => {
              onNewGroup();
              setOpen(false);
            }}
            className="flex w-full items-center gap-1.5 h-7 rounded-md px-2 text-left text-body text-accent hover:bg-surface"
          >
            <HugeiconsIcon icon={Add01Icon} size={11} strokeWidth={2} /> New group
          </button>
        </div>
      )}
    </div>
  );
}
