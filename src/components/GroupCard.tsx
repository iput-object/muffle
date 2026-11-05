import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import type { GroupView, Mode, Unit, UnitRef } from "../services/tauri";
import { cn } from "../utils/cn";
import { displayName, unitTitles } from "../utils/displayName";
import { formatBytes, formatCpu } from "../utils/format";
import { unitType } from "../utils/unitType";
import { UnitIcon } from "./UnitIcon";

/** Members listed on the card; the rest are counted. */
const SHOWN = 3;

const MODE_TAG: Record<Mode, { label: string; className: string }> = {
  stop: { label: "Stop", className: "text-muted ring-line" },
  pause: { label: "Pause", className: "text-muted ring-line" },
  kill: { label: "Kill", className: "text-danger/90 ring-danger/25" },
};

type GroupCardProps = {
  group: GroupView;
  /** Live units by id, for icons and the current cost of the group. */
  units: Map<string, Unit>;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
};

type Member = { ref: UnitRef; unit: Unit | undefined };

export function GroupCard({ group, units, busy, onToggle, onEdit }: GroupCardProps) {
  const members: Member[] = group.units.map((ref) => ({ ref, unit: units.get(`${ref.bus}:${ref.name}`) }));
  const live = members.filter((m) => m.unit && !m.unit.frozen).map((m) => m.unit!);
  const cpu = live.reduce((sum, u) => sum + u.cpu, 0);
  const mem = live.reduce((sum, u) => sum + u.memBytes, 0);
  // Heaviest running members first: that's what muffling frees.
  const sorted = [...members].sort((a, b) => cost(b) - cost(a));
  const rest = members.length - SHOWN;
  const tag = MODE_TAG[group.mode];

  return (
    <div
      data-flash-id={group.id}
      className={cn(
        "group flex flex-col rounded-xl p-3.5 ring-1 transition-colors",
        group.muffled ? "bg-accent-strong/7 ring-accent/25" : "bg-surface ring-line",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-headline text-fg">{group.name}</p>
            <span className={cn("shrink-0 rounded px-1 text-footnote font-medium ring-1", tag.className)}>
              {tag.label}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-subheadline text-muted tabular-nums">
            {group.muffled ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="text-accent">{group.mode === "kill" ? "Killed" : "Muffled"}</span>
              </>
            ) : live.length ? (
              `${live.length} running · ${formatCpu(cpu)} · ${formatBytes(mem)}`
            ) : (
              "Nothing running"
            )}
          </p>
        </div>
        <IconButton
          icon={PencilEdit02Icon}
          label={`Edit ${group.name}`}
          onClick={onEdit}
          className="-mt-1 -mr-1 text-muted opacity-0 hover:bg-raised hover:text-fg group-hover:opacity-100 focus-visible:opacity-100"
        />
      </div>

      <ul className="mt-3 mb-3 flex flex-col gap-1.5 border-t border-line pt-3">
        {members.length === 0 ? (
          <li className="flex h-5 items-center text-subheadline text-dim">No members yet</li>
        ) : (
          sorted
            .slice(0, SHOWN)
            .map((m) => <MemberLine key={`${m.ref.bus}:${m.ref.name}`} member={m} muffled={group.muffled} />)
        )}
      </ul>

      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-subheadline text-dim">
          {rest > 0
            ? `+${rest} more`
            : members.length === 0
              ? ""
              : `${members.length} member${members.length === 1 ? "" : "s"}`}
        </span>
        {members.length === 0 ? (
          <Button onClick={onEdit}>Add members</Button>
        ) : (
          <Button
            onClick={onToggle}
            disabled={busy}
            variant={group.muffled ? "secondary" : group.mode === "kill" ? "danger-soft" : "primary"}
            className="min-w-20"
          >
            {busy && <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />}
            {group.muffled ? "Restore" : group.mode === "kill" ? "Kill" : "Muffle"}
          </Button>
        )}
      </div>
    </div>
  );
}

const cost = (m: Member) => (m.unit && !m.unit.frozen ? m.unit.memBytes + 1 : 0);

function MemberLine({ member: { ref, unit }, muffled }: { member: Member; muffled: boolean }) {
  const title = unit ? unitTitles(unit).title : displayName(ref.label || ref.name);
  const running = unit && !unit.frozen;
  return (
    <li className="flex h-5 items-center gap-2">
      <UnitIcon
        icon={unit?.icon}
        name={title}
        type={unitType({ kind: unit?.kind ?? (ref.name.startsWith("app-") ? "app" : "service"), bus: ref.bus })}
        size="sm"
        className={cn(!running && "opacity-50")}
      />
      <span className={cn("min-w-0 flex-1 truncate text-callout", running ? "text-fg" : "text-muted")} title={ref.name}>
        {title}
      </span>
      <span className="shrink-0 text-subheadline tabular-nums text-dim">
        {running ? formatBytes(unit.memBytes) : unit?.frozen ? "paused" : muffled ? "stopped" : "off"}
      </span>
    </li>
  );
}
