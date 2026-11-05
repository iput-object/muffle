import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "../../utils/cn";
import { IconButton } from "../ui/IconButton";

/** Label/value rows, hairlines between them. */
export function Fields({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-line">{children}</dl>;
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-baseline gap-3 py-2">
      <dt className="text-callout text-muted">{label}</dt>
      <dd className={cn("min-w-0 text-body text-fg", className)}>{children}</dd>
    </div>
  );
}

/** Ids, paths and command lines: mono, a touch smaller so it sits on the body baseline. */
export const MONO = "font-mono text-[11.5px] leading-4";

/** A quiet outlined tag, as on rows ("paused", "stopped"). */
export function Tag({
  children,
  tone = "muted",
  mono,
  title,
}: {
  children: ReactNode;
  tone?: "muted" | "warn" | "accent";
  mono?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center rounded px-1 text-footnote font-medium ring-1",
        mono && "font-mono font-normal",
        tone === "muted" && "text-muted ring-line",
        tone === "warn" && "text-warn ring-warn/30",
        tone === "accent" && "text-accent ring-accent/30",
      )}
    >
      {children}
    </span>
  );
}

/** Selectable mono text with a copy button; wraps instead of truncating. */
export function Copyable({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="group/copy -my-1 flex items-start gap-1">
      <code
        className={cn(MONO, "min-w-0 flex-1 py-1 whitespace-pre-wrap text-fg [overflow-wrap:anywhere] select-text")}
      >
        {/* Paths break after a slash rather than mid-name. */}
        {text.split("/").map((part, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <>
                /<wbr />
              </>
            )}
            {part}
          </Fragment>
        ))}
      </code>
      <IconButton
        icon={copied ? Tick02Icon : Copy01Icon}
        label={copied ? "Copied" : "Copy"}
        onClick={() =>
          navigator.clipboard
            ?.writeText(text)
            .then(() => setCopied(true))
            .catch(() => {})
        }
        className={cn(
          "-mr-1.5 h-6 w-6 transition-opacity",
          copied
            ? "text-accent"
            : "text-dim opacity-0 group-hover/copy:opacity-100 hover:bg-raised hover:text-fg focus-visible:opacity-100",
        )}
      />
    </div>
  );
}

/** A dot for a unit or process state. */
export function StateDot({ tone }: { tone: StateTone }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full",
        tone === "ok" && "bg-ok",
        tone === "paused" && "bg-accent",
        tone === "warn" && "bg-warn",
        tone === "bad" && "bg-danger",
        tone === "off" && "bg-dim/60",
      )}
    />
  );
}

export type StateTone = "ok" | "paused" | "warn" | "bad" | "off";
