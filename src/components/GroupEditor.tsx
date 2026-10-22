import { useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { IconButton } from "./ui/IconButton";
import { Segmented } from "./ui/Segmented";
import { api, unitRef, type Group, type Mode, type Unit, type UnitRef } from "../services/tauri";
import { cn } from "../utils/cn";
import { formatCpu } from "../utils/format";
import { Button } from "./ui/Button";
import { UnitIcon } from "./UnitIcon";

const MODES: { value: Mode; label: string; hint: string }[] = [
  {
    value: "stop",
    label: "Stop",
    hint: "Services stop and free their memory. Open apps are paused, since a closed app can't be reopened.",
  },
  {
    value: "pause",
    label: "Pause",
    hint: "Everything is frozen: no CPU at all, memory kept, resumes instantly.",
  },
  {
    value: "kill",
    label: "Kill",
    hint: "Everything is force-closed at once. Services come back on restore; apps are closed for good.",
  },
];

type GroupEditorProps = {
  group: Group;
  units: Unit[];
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
};

const key = (u: { bus: string; name: string }) => `${u.bus}:${u.name}`;

export function GroupEditor({ group, units, onClose, onSaved, onError }: GroupEditorProps) {
  const [name, setName] = useState(group.name);
  const [mode, setMode] = useState<Mode>(group.mode);
  const [selected, setSelected] = useState<Map<string, UnitRef>>(
    () => new Map(group.units.map((u) => [key(u), u])),
  );
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const isNew = !group.id;

  // Running units plus selected ones that aren't running right now.
  const choices = useMemo(() => {
    const live = new Map(units.filter((u) => !u.protected).map((u) => [u.id, u]));
    const offline = [...selected.values()]
      .filter((u) => !live.has(key(u)))
      .map((u) => ({ ref: u, unit: undefined as Unit | undefined }));
    const all = [...offline, ...[...live.values()].map((u) => ({ ref: unitRef(u), unit: u as Unit | undefined }))];
    const q = query.trim().toLowerCase();
    return all
      .filter(({ ref }) => !q || ref.label.toLowerCase().includes(q) || ref.name.toLowerCase().includes(q))
      .sort((a, b) => Number(selected.has(key(b.ref))) - Number(selected.has(key(a.ref))));
  }, [units, selected, query]);

  function toggle(ref: UnitRef) {
    setSelected((m) => {
      const next = new Map(m);
      if (next.has(key(ref))) next.delete(key(ref));
      else next.set(key(ref), ref);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api.saveGroup({ id: group.id, name, mode, units: [...selected.values()] });
      onSaved();
      onClose();
    } catch (e) {
      onError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await api.deleteGroup(group.id);
      onSaved();
      onClose();
    } catch (e) {
      onError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl bg-bg shadow-2xl ring-1 ring-line">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pr-3 pl-5">
          <h2 className="text-title3">{isNew ? "New group" : "Edit group"}</h2>
          <IconButton icon={Cancel01Icon} label="Close" onClick={onClose} />
        </div>

        <div className="flex shrink-0 flex-col gap-3 px-5 pt-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. Heavy stuff"
            className="h-7 rounded-md bg-surface px-3 text-body text-fg ring-1 ring-line outline-none placeholder:text-dim focus:ring-accent/40"
          />
          <div className="flex items-center gap-3">
            <Segmented options={MODES} value={mode} onChange={setMode} />
            <p className="text-subheadline text-muted">{MODES.find((m) => m.value === mode)?.hint}</p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5 pt-4 pb-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-headline">Members</h3>
            <span className="text-subheadline tabular-nums text-muted">{selected.size} selected</span>
          </div>
          <label className="mb-2 flex h-7 items-center gap-2 rounded-md bg-surface px-3 ring-1 ring-line focus-within:ring-accent/40">
            <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={2} className="text-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-body text-fg outline-none placeholder:text-dim"
            />
          </label>
          <ul className="-mx-3 min-h-32 flex-1 overflow-y-auto">
            {choices.map(({ ref, unit }) => {
              const on = selected.has(key(ref));
              return (
                <li key={key(ref)}>
                  <button
                    onClick={() => toggle(ref)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded ring-1",
                        on ? "bg-accent-strong ring-accent-strong" : "ring-dim",
                      )}
                    >
                      {on && <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={2} className="text-white" />}
                    </span>
                    <UnitIcon icon={unit?.icon} />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate text-body text-fg">{ref.label || ref.name}</span>
                      {ref.bus === "system" && (
                        <span className="shrink-0 rounded px-1 text-footnote font-medium text-dim ring-1 ring-line">
                          system
                        </span>
                      )}
                    </span>
                    <span className="text-callout tabular-nums text-muted">
                      {unit ? formatCpu(unit.cpu) : "Not running"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-line px-5 py-3">
          {!isNew && (
            <Button variant="danger" onClick={remove} disabled={saving}>
              Delete
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={saving || !name.trim()}>
              {isNew ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
