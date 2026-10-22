import { useCallback, useEffect, useState } from "react";
import { api, type Startup as StartupList, type StartupItem } from "../services/tauri";
import { cn } from "../utils/cn";
import type { Notify } from "../components/StatusBar";
import { Empty, Page, Section } from "../components/Page";
import { UnitIcon } from "../components/UnitIcon";

function Switch({ checked, disabled, onChange, label }: {
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-accent-strong" : "bg-raised",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform",
          checked ? "translate-x-4 bg-white" : "bg-muted",
        )}
      />
    </button>
  );
}

function StartupRows({ items, busy, onToggle }: {
  items: StartupItem[];
  busy: Set<string>;
  onToggle: (item: StartupItem, enabled: boolean) => void;
}) {
  return (
    <ul className="divide-y divide-line rounded-lg bg-surface ring-1 ring-line">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
          <UnitIcon icon={item.icon} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={cn("truncate text-body", item.enabled ? "text-fg" : "text-muted")}>
                {item.label}
              </span>
              {item.bus === "system" && (
                <span className="shrink-0 rounded px-1 text-footnote font-medium text-dim ring-1 ring-line">system</span>
              )}
            </div>
            <p className="truncate text-subheadline text-muted">{item.description || item.name}</p>
          </div>
          <Switch
            label={`Start ${item.label} automatically`}
            checked={item.enabled}
            disabled={busy.has(item.id)}
            onChange={(v) => onToggle(item, v)}
          />
        </li>
      ))}
    </ul>
  );
}

export default function Startup({ notify }: { notify: Notify }) {
  const [list, setList] = useState<StartupList | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setList(await api.listStartup());
    } catch (e) {
      notify(String(e), "error");
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(item: StartupItem, enabled: boolean) {
    setBusy((s) => new Set(s).add(item.id));
    try {
      await api.setStartup(item, enabled);
      notify(`${item.label} ${enabled ? "will" : "won't"} start ${item.kind === "app" ? "at next login" : "automatically"}`);
      await load();
    } catch (e) {
      notify(`${item.label}: ${e}`, "error");
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(item.id);
        return next;
      });
    }
  }

  if (!list) {
    return (
      <Page>
        <Empty>Loading…</Empty>
      </Page>
    );
  }

  return (
    <Page>
      <Section title="Apps · start when you log in">
        {list.apps.length ? (
          <StartupRows items={list.apps} busy={busy} onToggle={toggle} />
        ) : (
          <Empty>No login apps.</Empty>
        )}
      </Section>
      <Section title="Services · start at boot or login">
        {list.services.length ? (
          <StartupRows items={list.services} busy={busy} onToggle={toggle} />
        ) : (
          <Empty>No services enabled.</Empty>
        )}
      </Section>
    </Page>
  );
}
