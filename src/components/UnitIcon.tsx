import { cn } from "../utils/cn";
import { monogram } from "../utils/displayName";
import type { UnitType } from "../utils/unitType";

const TINT: Record<UnitType, string> = {
  app: "bg-type-app/14 text-type-app-fg ring-type-app/25",
  user: "bg-type-user/14 text-type-user-fg ring-type-user/25",
  system: "bg-type-system/14 text-type-system-fg ring-type-system/25",
};

const SIZE = {
  md: { box: "h-[22px] w-[22px] rounded-[6px] text-[11px]", img: "h-[22px] w-[22px]" },
  sm: { box: "h-4 w-4 rounded-[4px] text-[9px]", img: "h-4 w-4" },
};

/**
 * The app's own icon when it has one; otherwise a monogram tile tinted by type,
 * so a long list of services reads as distinct names rather than repeated gears.
 */
export function UnitIcon({
  icon,
  name,
  type,
  size = "md",
  className,
}: {
  icon: string | null | undefined;
  name: string;
  type: UnitType;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const s = SIZE[size];
  return icon ? (
    <img src={icon} alt="" className={cn("shrink-0 object-contain", s.img, className)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold leading-none ring-1 ring-inset",
        s.box,
        TINT[type],
        className,
      )}
    >
      {monogram(name)}
    </span>
  );
}
