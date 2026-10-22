import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import type { Snapshot } from "../services/tauri";
import type { UpdaterStatus } from "../hooks/useUpdater";
import { cn } from "../utils/cn";
import { formatBytes } from "../utils/format";

export type Notice = { text: string; tone: "info" | "error" };
export type Notify = (text: string, tone?: Notice["tone"]) => void;

type StatusBarProps = {
  snapshot: Snapshot | null;
  /** A refresh failure, shown until the next good refresh. */
  error: string | null;
  notice: Notice | null;
  update: UpdaterStatus;
  onOpenUpdate: () => void;
};

function Meter({ label, ratio, value }: { label: string; ratio: number; value: string }) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return (
    <span className="flex items-center gap-2">
      <span className="text-dim">{label}</span>
      <span className="h-1 w-12 overflow-hidden rounded-full bg-raised">
        <span
          className={cn("block h-full rounded-full transition-[width] duration-500", pct >= 85 ? "bg-warn" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="text-muted">{value}</span>
    </span>
  );
}

export function StatusBar({ snapshot, error, notice, update, onOpenUpdate }: StatusBarProps) {
  const message = error ? { text: error, tone: "error" as const } : notice;
  const muffled = snapshot?.groups.filter((g) => g.muffled).length ?? 0;

  return (
    <footer className="flex h-8 shrink-0 items-center gap-5 border-t border-line bg-surface px-4 text-subheadline leading-none tabular-nums">
      {snapshot && (
        <>
          <Meter label="CPU" ratio={snapshot.cpu / 100} value={`${Math.round(snapshot.cpu)}%`} />
          <Meter
            label="RAM"
            ratio={snapshot.memTotal ? snapshot.memUsed / snapshot.memTotal : 0}
            value={`${formatBytes(snapshot.memUsed)} / ${formatBytes(snapshot.memTotal)}`}
          />
          {muffled > 0 && (
            <span className="flex items-center gap-1.5 text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {muffled} group{muffled === 1 ? "" : "s"} muffled
            </span>
          )}
        </>
      )}

      <div className="ml-auto flex min-w-0 items-center">
        {message ? (
          <span title={message.text} className={cn("truncate", message.tone === "error" ? "text-danger" : "text-muted")}>
            {message.text}
          </span>
        ) : update.phase === "available" || update.phase === "ready" ? (
          <button onClick={onOpenUpdate} className="text-accent hover:underline">
            {update.phase === "ready" ? `Restart for v${update.version}` : `v${update.version} available`}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-dim">
            <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={2} />
            Use with caution, stopping system services can break things
          </span>
        )}
      </div>
    </footer>
  );
}
