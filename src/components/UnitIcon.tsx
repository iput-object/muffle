import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { cn } from "../utils/cn";

/** App icon when there is one, a neutral gear for services. */
export function UnitIcon({ icon, className }: { icon: string | null | undefined; className?: string }) {
  return icon ? (
    <img src={icon} alt="" className={cn("h-5 w-5 object-contain", className)} />
  ) : (
    <span className={cn("flex h-5 w-5 items-center justify-center", className)}>
      <HugeiconsIcon icon={Settings01Icon} size={15} className="text-dim" />
    </span>
  );
}
