import type { ReactNode } from "react";
import { cn } from "../utils/cn";

/**
 * Scrollable page body. Every page uses the full content width with the title
 * bar's 28px gutter: 22px padding plus the 6px scrollbar gutter, reserved on both
 * sides so the content stays centred whether or not the page scrolls.
 */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex-1 overflow-y-auto px-[22px] py-6 [scrollbar-gutter:stable_both-edges]", className)}>
      {children}
    </div>
  );
}

/** A titled block inside a page, with an optional muted note and a right-aligned extra. */
export function Section({
  title,
  note,
  aside,
  children,
  className,
}: {
  title: string;
  note?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-7 last:mb-0", className)}>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="text-headline text-fg">{title}</h2>
        {note && <span className="truncate text-subheadline text-muted">{note}</span>}
        {aside !== undefined && <span className="ml-auto text-subheadline tabular-nums text-dim">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** One-line empty state. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-callout text-muted">
      {children}
    </p>
  );
}

/** An empty list: what's missing and what to do about it, with an optional action. */
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-white/10 px-6 py-9 text-center">
      <p className="text-headline text-fg">{title}</p>
      <p className="mt-1 max-w-[52ch] text-callout text-balance text-muted">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
