import { HugeiconsIcon } from "@hugeicons/react";
import { MinusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { MergedDetails } from "../../hooks/useUnitDetails";
import { cn } from "../../utils/cn";
import { Section } from "../Page";
import { Field, Fields, MONO, Tag } from "./parts";

const capName = (c: string) => c.replace(/^CAP_/, "");

export function Permissions({ details }: { details: MergedDetails }) {
  const { processes, sandbox } = details;
  const main = processes.find((p) => p.pid === details.mainPid) ?? processes[0];
  const user = details.user ?? main?.user ?? null;
  const group = details.group ?? main?.group ?? null;
  const isRoot = user === "root" || main?.uid === 0;
  const others = [...new Set(processes.map((p) => p.user))].filter((u) => u !== user);

  const allCaps = processes.some((p) => p.allCapabilities);
  const caps = [...new Set(processes.flatMap((p) => p.capabilities))].sort();
  const isService = details.name.endsWith(".service");
  const on = sandbox.filter((s) => s.hardened).length;

  return (
    <>
      <Section title="Runs as" className="mb-6">
        <Fields>
          <Field label="User">
            {user ? (
              <span className="flex items-baseline gap-2">
                <span className={MONO}>{user}</span>
                {isRoot &&
                  (allCaps ? (
                    <Tag tone="warn">full system access</Tag>
                  ) : (
                    <span className="text-callout text-muted">limited to the capabilities below</span>
                  ))}
              </span>
            ) : (
              <span className="text-muted">Unknown</span>
            )}
          </Field>
          {group && (
            <Field label="Group">
              <span className={MONO}>{group}</span>
            </Field>
          )}
          {isService && (
            <Field label="Dynamic user">
              {details.dynamicUser ? "Yes, a throwaway user for each start" : <span className="text-muted">No</span>}
            </Field>
          )}
          {others.length > 0 && (
            <Field label="Also as">
              <span className="flex flex-wrap gap-1">
                {others.map((u) => (
                  <Tag key={u} mono tone={u === "root" ? "warn" : "muted"}>
                    {u}
                  </Tag>
                ))}
              </span>
            </Field>
          )}
        </Fields>
      </Section>

      <Section
        title="Capabilities"
        note={!allCaps && caps.length ? "Kernel privileges it holds" : undefined}
        aside={!allCaps && caps.length ? caps.length : undefined}
        className="mb-6"
      >
        {allCaps ? (
          <p className="text-body text-fg">
            All capabilities <span className="text-muted">{isRoot ? "(root)" : "(granted to a non-root user)"}</span>
          </p>
        ) : caps.length ? (
          <div className="flex flex-wrap gap-1">
            {caps.map((c) => (
              <Tag key={c} mono title={c}>
                {capName(c)}
              </Tag>
            ))}
          </div>
        ) : (
          <p className="text-body text-muted">None, limited to what its user can do.</p>
        )}
      </Section>

      {sandbox.length > 0 && (
        <Section title="Sandboxing" note={on ? `${on} of ${sandbox.length} protections on` : `None of the ${sandbox.length} protections on`} className="mb-0">
          <ul className="divide-y divide-line">
            {sandbox.map((s) => (
              <li key={s.key} className="flex h-8 items-center gap-2.5">
                <HugeiconsIcon
                  icon={s.hardened ? Tick02Icon : MinusSignIcon}
                  size={13}
                  strokeWidth={2}
                  className={cn("shrink-0", s.hardened ? "text-accent" : "text-dim")}
                  aria-label={s.hardened ? "On" : "Off"}
                />
                <span className={cn("min-w-0 flex-1 truncate text-body", s.hardened ? "text-fg" : "text-muted")}>
                  {s.label}
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-dim">
                  {s.key}={s.value}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
