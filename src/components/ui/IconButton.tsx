import type { ButtonHTMLAttributes } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "../../utils/cn";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconSvgElement;
  /** Accessible name, also shown as the tooltip. */
  label: string;
};

/** The one square icon button: 28px, 14px icon. `className` replaces the colours, hover included. */
export function IconButton({ icon, label, className, ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50",
        className ?? "text-muted hover:bg-raised hover:text-fg",
      )}
      {...props}
    >
      <HugeiconsIcon icon={icon} size={14} strokeWidth={2} />
    </button>
  );
}
