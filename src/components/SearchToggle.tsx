import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { cn } from "../utils/cn";

type SearchToggleProps = {
  value: string;
  onChange: (value: string) => void;
  /** Bumped by the Ctrl+F shortcut to open and focus the field. */
  focusSignal: number;
};

/** A search icon that expands into an input; Escape clears and closes it. */
export function SearchToggle({ value, onChange, focusSignal }: SearchToggleProps) {
  const [open, setOpen] = useState(value !== "");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!focusSignal) return;
    setOpen(true);
    input.current?.focus();
  }, [focusSignal]);

  function close() {
    onChange("");
    setOpen(false);
  }

  return (
    <div
      className={cn(
        "flex h-7 items-center overflow-hidden rounded-md transition-[width,background-color] duration-200",
        open ? "w-56 bg-surface ring-1 ring-line focus-within:ring-accent/40" : "w-7",
      )}
    >
      <button
        onClick={() => (open ? input.current?.focus() : setOpen(true))}
        aria-label="Search"
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
          open ? "text-dim" : "text-muted hover:bg-raised hover:text-fg",
        )}
      >
        <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={2} />
      </button>
      {open && (
        <>
          <input
            ref={input}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && close()}
            onBlur={() => value === "" && setOpen(false)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-dim"
          />
          {value && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={close}
              aria-label="Clear search"
              className="flex h-7 w-7 shrink-0 items-center justify-center text-dim hover:text-fg"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
