import { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import type { Group, Snapshot } from "../services/tauri";
import type { Notify } from "../components/StatusBar";
import { Empty, Page, Section } from "../components/Page";
import { GroupCard } from "../components/GroupCard";
import { Button } from "../components/ui/Button";
import { useGroupActions } from "../hooks/useGroupActions";

type GroupsProps = {
  snapshot: Snapshot | null;
  refresh: () => void;
  notify: Notify;
  onEditGroup: (group: Group) => void;
};

const NEW_GROUP: Group = { id: "", name: "", mode: "stop", units: [] };

export default function Groups({ snapshot, refresh, notify, onEditGroup }: GroupsProps) {
  const groups = snapshot?.groups ?? [];
  const byId = useMemo(() => new Map((snapshot?.units ?? []).map((u) => [u.id, u])), [snapshot]);
  const groupActions = useGroupActions(notify, refresh);

  return (
    <Page>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-callout text-muted">
          Muffle a group to stop everything in it at once. Restore brings back exactly what was stopped.
        </p>
        <Button variant="primary" onClick={() => onEditGroup(NEW_GROUP)}>
          <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} /> New group
        </Button>
      </div>

      {groups.length === 0 ? (
        <Empty>
          No groups yet. Make one like “Heavy stuff” with what you don't need while coding.
        </Empty>
      ) : (
        <Section title={`${groups.length} group${groups.length === 1 ? "" : "s"}`}>
          <div className="grid grid-cols-2 gap-2">
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
        <pre className="rounded-lg bg-surface px-4 py-3 font-mono text-subheadline leading-relaxed text-muted ring-1 ring-line">
          {`muffle off <group>   muffle on <group>   muffle status

muffle off heavy; and pnpm dev`}
        </pre>
      </Section>
    </Page>
  );
}
