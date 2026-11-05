import type { Unit } from "../../services/tauri";
import type { MergedDetails } from "../../hooks/useUnitDetails";
import { formatBytes, formatCpu, formatTime } from "../../utils/format";
import { Section } from "../Page";
import { Copyable, Field, Fields, MONO, Tag } from "./parts";

const words = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).replace(/-/g, " ") : s);

/** UnitFileState in plain words. Empty (scopes) means "not applicable". */
function startup(state: string, bus: Unit["bus"]): string | null {
  switch (state) {
    case "":
      return null;
    case "enabled":
    case "enabled-runtime":
      return bus === "system" ? "At boot" : "At login";
    case "disabled":
      return "Only when started by hand";
    case "static":
      return "When another unit needs it";
    case "indirect":
      return "Through another unit";
    case "masked":
    case "masked-runtime":
      return "Never, it's masked";
    case "generated":
      return "Set up by a generator";
    case "transient":
      return "Created on the fly";
    case "alias":
      return "As an alias";
    default:
      return words(state);
  }
}

/** "Network Manager" and "NetworkManager" say the same thing. */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function restart(policy: string): string {
  return policy === "no" ? "Never" : words(policy);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-2.5">
      <span className="text-subheadline text-muted">{label}</span>
      <span className="text-headline tabular-nums text-fg">{value}</span>
    </div>
  );
}

export function Overview({ unit, details, title }: { unit: Unit; details: MergedDetails; title: string }) {
  const main = details.processes.find((p) => p.pid === details.mainPid) ?? details.processes[0];
  const command = details.exec ?? main?.cmdline ?? null;
  const threads = details.processes.reduce((n, p) => n + p.threads, 0);
  const starts = startup(details.unitFileState, details.bus);
  const description = details.description.trim();
  const isService = details.name.endsWith(".service");

  return (
    <>
      <div className="mb-6 grid grid-cols-4 divide-x divide-line rounded-lg bg-surface ring-1 ring-line">
        <Stat label="CPU" value={formatCpu(unit.cpu)} />
        <Stat label="Memory" value={formatBytes(unit.memBytes)} />
        <Stat label="Processes" value={String(details.processes.length)} />
        <Stat label="Threads" value={String(threads)} />
      </div>

      <Section title={isService ? "Service" : "Unit"} className="mb-6">
        <Fields>
          {description && squash(description) !== squash(title) && <Field label="Description">{description}</Field>}
          {starts && (
            <Field label="Starts">
              <span className="flex items-baseline gap-2">
                {starts}
                <Tag mono>{details.unitFileState}</Tag>
              </span>
            </Field>
          )}
          {details.unitFile && (
            <Field label="Unit file">
              <Copyable text={details.unitFile} />
            </Field>
          )}
          {details.restart && <Field label="Restarts">{restart(details.restart)}</Field>}
          {details.activeSince && <Field label="Started">{formatTime(details.activeSince)}</Field>}
          {details.scopes > 1 && <Field label="Scopes">{details.scopes}, from one launch, shown together</Field>}
        </Fields>
      </Section>

      <Section title="Process" className="mb-0">
        <Fields>
          {details.mainPid && (
            <Field label="Main PID" className={MONO}>
              {details.mainPid}
            </Field>
          )}
          {command && (
            <Field label="Command">
              <Copyable text={command} />
            </Field>
          )}
          {details.controlGroup && (
            <Field label="Control group">
              <Copyable text={details.controlGroup} />
            </Field>
          )}
        </Fields>
      </Section>
    </>
  );
}
