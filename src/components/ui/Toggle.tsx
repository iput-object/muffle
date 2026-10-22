import { cn } from "../../utils/cn";

type ToggleProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex flex-col">
        <span className="text-body text-fg">{label}</span>
        {description && <span className="mt-0.5 text-subheadline text-muted">{description}</span>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-accent",
          checked ? "bg-accent-strong" : "bg-raised",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform",
            checked ? "translate-x-4 bg-white" : "bg-muted",
          )}
        />
      </button>
    </div>
  );
}
