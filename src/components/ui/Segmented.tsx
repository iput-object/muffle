import { cn } from "../../utils/cn";

type SegmentedProps<T extends string | number> = {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** Track colour; defaults to the surface tone. */
  className?: string;
};

/** Segmented control, 28px tall to line up with buttons. */
export function Segmented<T extends string | number>({ options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={cn("flex h-7 shrink-0 items-center gap-0.5 rounded-lg p-0.5", className ?? "bg-surface")}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-6 rounded-md px-2.5 text-callout tabular-nums transition-colors",
            value === o.value ? "bg-raised text-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
