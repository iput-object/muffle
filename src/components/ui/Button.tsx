import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "danger-solid";
};

/** The one text button: 28px tall, same as IconButton and Segmented. */
export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-body transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent-strong text-white hover:bg-accent-strong/85",
        variant === "secondary" && "bg-raised text-fg ring-1 ring-line hover:bg-raised/70",
        variant === "ghost" && "text-muted hover:bg-raised hover:text-fg",
        variant === "danger" && "text-danger hover:bg-danger/10",
        variant === "danger-solid" && "bg-danger text-bg hover:bg-danger/85",
        className,
      )}
      {...props}
    />
  );
}
