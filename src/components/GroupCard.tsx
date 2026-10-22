import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import type { GroupView, Unit } from "../services/tauri";
import { cn } from "../utils/cn";
import { formatBytes, formatCpu } from "../utils/format";
import { UnitIcon } from "./UnitIcon";

type GroupCardProps = {
  group: GroupView;
  /** Live units by id, for icons and the current cost of the group. */
  units: Map<string, Unit>;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
};

export function GroupCard({ group, units, busy, onToggle, onEdit }: GroupCardProps) {
  const members = group.units.map((u) => units.get(`${u.bus}:${u.name}`));
  const live = members.filter((u): u is Unit => !!u && !u.frozen);
  const cpu = live.reduce((sum, u) => sum + u.cpu, 0);
  const mem = live.reduce((sum, u) => sum + u.memBytes, 0);

  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-lg p-3 ring-1 transition-colors",
        group.muffled ? "bg-accent-strong/8 ring-accent/25" : "bg-surface ring-line",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-headline text-fg">{group.name}</p>
          <p className="mt-0.5 text-subheadline text-muted">
            {group.muffled
              ? group.mode === "kill"
                ? "Killed"
                : "Muffled"
              : live.length
                ? `${live.length} running · ${formatCpu(cpu)} · ${formatBytes(mem)}`
                : "Nothing running"}
          </p>
        </div>
        <IconButton
          icon={PencilEdit02Icon}
          label={`Edit ${group.name}`}
          onClick={onEdit}
          className="-mt-1 -mr-1 text-muted opacity-0 hover:bg-raised hover:text-fg group-hover:opacity-100 focus-visible:opacity-100"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center -space-x-1">
          {group.units.slice(0, 6).map((u, i) => (
            <UnitIcon
              key={u.name}
              icon={members[i]?.icon}
              className="rounded-full bg-raised p-0.5 ring-2 ring-bg"
            />
          ))}
          {group.units.length > 6 && (
            <span className="pl-2 text-subheadline text-dim">+{group.units.length - 6}</span>
          )}
          {group.units.length === 0 && <span className="text-subheadline text-dim">Empty</span>}
        </div>

        <Button
          onClick={onToggle}
          disabled={busy || group.units.length === 0}
          variant={group.muffled ? "secondary" : group.mode === "kill" ? "danger-solid" : "primary"}
          className="min-w-20"
        >
          {busy && <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />}
          {group.muffled ? "Restore" : group.mode === "kill" ? "Kill" : "Muffle"}
        </Button>
      </div>
    </div>
  );
}
