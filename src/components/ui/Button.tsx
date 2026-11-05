import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "danger-soft";
};

/** The one text button: 28px tall, same as IconButton and Segmented. */
export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-body transition-colors disabled:cursor-not-allowed",
        variant === "primary" &&
          "bg-accent-strong text-white hover:bg-accent-strong/85 disabled:bg-raised disabled:text-dim disabled:ring-1 disabled:ring-line",
        variant === "secondary" && "bg-raised text-fg ring-1 ring-line hover:bg-raised/70 disabled:opacity-50",
        variant === "ghost" && "text-muted hover:bg-raised hover:text-fg disabled:opacity-50",
        variant === "danger" && "text-danger hover:bg-danger/10 disabled:opacity-50",
        variant === "danger-soft" &&
          "bg-danger/12 text-danger ring-1 ring-danger/25 ring-inset hover:bg-danger/20 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
