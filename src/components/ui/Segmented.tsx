import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../utils/cn";

type SegmentedProps<T extends string | number> = {
  options: { value: T; label: ReactNode }[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** Track colour; defaults to the surface tone. */
  className?: string;
  /** Act as tabs (tablist semantics, arrow keys) for the panel with this id prefix. */
  tabsFor?: string;
};

/** Segmented control, 28px tall to line up with buttons. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
  tabsFor,
}: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent) {
    if (!tabsFor || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value);
    ref.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }

  return (
    <div
      ref={ref}
      role={tabsFor ? "tablist" : undefined}
      onKeyDown={onKeyDown}
      className={cn("flex h-7 shrink-0 items-center gap-0.5 rounded-lg p-0.5", className ?? "bg-surface")}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            {...(tabsFor && {
              role: "tab",
              id: `${tabsFor}-tab-${o.value}`,
              "aria-selected": on,
              "aria-controls": `${tabsFor}-panel`,
              tabIndex: on ? 0 : -1,
            })}
            className={cn(
              "h-6 rounded-md px-2.5 text-callout tabular-nums transition-colors",
              on ? "bg-raised text-fg" : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
