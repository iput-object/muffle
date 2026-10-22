import type { ReactNode } from "react";
import { cn } from "../utils/cn";

/** Scrollable page body. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex-1 overflow-y-auto px-5 py-4", className)}>{children}</div>;
}

/** A titled block inside a page. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-headline text-fg">{title}</h2>
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
