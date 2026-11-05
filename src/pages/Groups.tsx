import { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import type { Group, Snapshot } from "../services/tauri";
import type { Notify } from "../components/StatusBar";
import { EmptyState, Page, Section } from "../components/Page";
import { GroupCard } from "../components/GroupCard";
import { Button } from "../components/ui/Button";
import { useGroupActions } from "../hooks/useGroupActions";
import { useFlash, type Flash } from "../hooks/useFlash";

type GroupsProps = {
  snapshot: Snapshot | null;
  refresh: () => void;
  notify: Notify;
  onEditGroup: (group: Group) => void;
  /** A group picked in search, to scroll to and flash. */
  flash: Flash;
};

const NEW_GROUP: Group = { id: "", name: "", mode: "stop", units: [] };

const CLI: [string, string][] = [
  ["muffle off <group>", "Muffle a group"],
  ["muffle on <group>", "Restore it"],
  ["muffle status", "See which groups are muffled"],
  ["muffle off heavy; and pnpm dev", "Free up the machine before a heavy task"],
];

export default function Groups({ snapshot, refresh, notify, onEditGroup, flash }: GroupsProps) {
  useFlash(flash, !!snapshot);
  const groups = snapshot?.groups ?? [];
  const byId = useMemo(() => new Map((snapshot?.units ?? []).map((u) => [u.id, u])), [snapshot]);
  const groupActions = useGroupActions(notify, refresh);

  const newGroup = (
    <Button variant="primary" onClick={() => onEditGroup(NEW_GROUP)}>
      <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} /> New group
    </Button>
  );

  return (
    <Page>
      <div className="mb-6 flex items-center justify-between gap-6">
        <p className="text-callout text-muted">
          Muffle a group to stop everything in it at once. Restore brings back exactly what was stopped.
        </p>
        {newGroup}
      </div>

      {groups.length === 0 ? (
        <Section title="Your groups">
          <EmptyState title="No groups yet">
            Make one like “Heavy stuff” with what you don't need while coding.
          </EmptyState>
        </Section>
      ) : (
        <Section title="Your groups" aside={groups.length}>
          <div className="grid grid-cols-3 gap-3">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                units={byId}
                busy={groupActions.busy.has(g.id)}
                onToggle={() => groupActions.toggle(g)}
                onEdit={() => onEditGroup(g)}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title="From a terminal">
        <div className="divide-y divide-line overflow-hidden rounded-lg bg-surface ring-1 ring-line">
          {CLI.map(([cmd, what]) => (
            <div key={cmd} className="flex items-center gap-4 px-4 py-2.5">
              <code className="w-64 shrink-0 font-mono text-callout text-fg">
                <span className="text-dim select-none">$ </span>
                {cmd}
              </code>
              <span className="text-callout text-muted">{what}</span>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  );
}
