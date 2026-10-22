import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, SquareLock02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "../utils/cn";
import { UNIT_TYPES, type UnitType } from "../utils/unitType";

type TypeFilterProps = {
  value: UnitType | null;
  onChange: (value: UnitType | null) => void;
  counts: Record<UnitType, number>;
  /** Core system units muffle never stops; hidden unless turned on here. */
  showProtected: boolean;
  onShowProtected: (show: boolean) => void;
  protectedCount: number;
};

/** The Type column header: click it to filter the list by type, or show protected units. */
export function TypeFilter({
  value,
  onChange,
  counts,
  showProtected,
  onShowProtected,
  protectedCount,
}: TypeFilterProps) {
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

  const options = [
    { value: null, label: "All types", color: null, count: counts.app + counts.user + counts.system },
    ...UNIT_TYPES.map((t) => ({ value: t.value, label: t.label, color: t.color, count: counts[t.value] })),
  ];
  const current = UNIT_TYPES.find((t) => t.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn("flex items-center gap-1 hover:text-fg", (current || showProtected) && "text-accent")}
      >
        {current ? current.short : "Type"}
        <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute top-6 left-0 z-30 w-56 rounded-lg bg-raised p-1 shadow-xl ring-1 ring-line">
          {options.map((o) => (
            <button
              key={o.label}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-body text-fg hover:bg-surface"
            >
              <span className="flex w-3 justify-center">
                {o.value === value && <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />}
              </span>
              {o.color ? <span className={cn("h-2 w-2 rounded-sm", o.color)} /> : <span className="w-2" />}
              <span className="flex-1">{o.label}</span>
              <span className="text-subheadline tabular-nums text-dim">{o.count}</span>
            </button>
          ))}
          {protectedCount > 0 && (
            <>
              <div className="my-1 h-px bg-line" />
              <button
                onClick={() => onShowProtected(!showProtected)}
                title="Core system units muffle never stops"
                className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-body text-fg hover:bg-surface"
              >
                <span className="flex w-3 justify-center">
                  {showProtected && <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />}
                </span>
                <HugeiconsIcon icon={SquareLock02Icon} size={12} className="text-dim" />
                <span className="flex-1">Show protected</span>
                <span className="text-subheadline tabular-nums text-dim">{protectedCount}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
