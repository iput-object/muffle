import { useEffect, useState } from "react";
import { TrayIcon } from "@tauri-apps/api/tray";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { api, type SettingsView } from "../services/tauri";
import { cn } from "../utils/cn";
import type { Notify } from "../components/StatusBar";
import { Toggle } from "../components/ui/Toggle";
import { Button } from "../components/ui/Button";
import { Page, Section } from "../components/Page";
import { Segmented } from "../components/ui/Segmented";
import { SHORTCUTS } from "../utils/shortcuts";
import type { Updater } from "../hooks/useUpdater";

const TRAY_KEY = "muffle.showTrayIcon";
const INTERVALS = [1, 2, 5, 10];

type SettingsProps = {
  notify: Notify;
  onSettingsChanged: () => void;
  updater: Updater;
};

export default function Settings({ notify, onSettingsChanged, updater }: SettingsProps) {
  const [autostart, setAutostart] = useState(false);
  const [showTray, setShowTray] = useState(() => localStorage.getItem(TRAY_KEY) !== "false");
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [protectedText, setProtectedText] = useState("");

  useEffect(() => {
    isEnabled().then(setAutostart).catch(() => {});
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        setProtectedText(s.protected.join("\n"));
      })
      .catch((e) => notify(String(e), "error"));
  }, [notify]);

  async function toggleAutostart(on: boolean) {
    try {
      await (on ? enable() : disable());
      setAutostart(on);
    } catch (e) {
      notify(String(e), "error");
    }
  }

  function toggleTray(on: boolean) {
    localStorage.setItem(TRAY_KEY, String(on));
    setShowTray(on);
    TrayIcon.getById("main")
      .then((tray) => tray?.setVisible(on))
      .catch(() => {});
  }

  async function save(next: Partial<SettingsView>, message: string) {
    if (!settings) return;
    const merged = { ...settings, ...next };
    try {
      await api.saveSettings({ refreshSeconds: merged.refreshSeconds, protected: merged.protected });
      setSettings(merged);
      onSettingsChanged();
      notify(message);
    } catch (e) {
      notify(String(e), "error");
    }
  }

  const protectedList = protectedText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const protectedDirty = settings && protectedList.join("\n") !== settings.protected.join("\n");

  return (
    <Page>
      <Section title="General">
        <div className="divide-y divide-line rounded-lg bg-surface px-4 ring-1 ring-line">
          <Toggle
            label="Start at login"
            description="Open hidden in the tray when you log in"
            checked={autostart}
            onChange={toggleAutostart}
          />
          <Toggle
            label="Show tray icon"
            description="Muffle and restore groups from the tray"
            checked={showTray}
            onChange={toggleTray}
          />
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex flex-col">
              <span className="text-body text-fg">Refresh every</span>
              <span className="mt-0.5 text-subheadline text-muted">Only while the window is open</span>
            </div>
            <Segmented
              className="bg-bg"
              options={INTERVALS.map((n) => ({ value: n, label: `${n}s` }))}
              value={settings?.refreshSeconds}
              onChange={(n) => save({ refreshSeconds: n }, `Refreshing every ${n}s`)}
            />
          </div>
        </div>
      </Section>

      <Section title="Protected">
        <div className="rounded-lg bg-surface p-4 ring-1 ring-line">
          <p className="mb-3 text-callout text-muted">
            muffle never stops these. Add your own, one per line: an exact unit name,{" "}
            <code className="text-muted">prefix*</code>, <code className="text-muted">*suffix</code> or{" "}
            <code className="text-muted">*part*</code>.
          </p>
          <textarea
            value={protectedText}
            onChange={(e) => setProtectedText(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder="app-niri-noctalia*"
            className="w-full resize-none rounded-md bg-bg px-3 py-2 font-mono text-callout text-fg ring-1 ring-line outline-none select-text placeholder:text-dim focus:ring-accent/40"
          />
          <div className="mt-2 flex items-center justify-between gap-4">
            <p className="truncate font-mono text-footnote text-dim" title={settings?.builtInProtected.join("  ")}>
              Built in: {settings?.builtInProtected.join("  ")}
            </p>
            <Button
              variant="primary"
              disabled={!protectedDirty}
              onClick={() => save({ protected: protectedList }, "Protected list saved")}
            >
              Save
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Updates">
        <UpdateRow updater={updater} />
      </Section>

      <Section title="Keyboard shortcuts">
        <ul className="grid grid-cols-2 gap-x-6 rounded-lg bg-surface px-4 py-2 ring-1 ring-line">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex h-8 items-center justify-between gap-3">
              <span className="text-body text-fg">{s.label}</span>
              <kbd className="rounded bg-bg px-1.5 py-px font-sans text-footnote text-muted ring-1 ring-line">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}

function UpdateRow({ updater }: { updater: Updater }) {
  const { status, checkNow, install, restart } = updater;

  const text = {
    idle: "Not checked yet",
    checking: "Checking…",
    latest: "You're on the latest version",
    available: status.phase === "available" && `Version ${status.version} is available`,
    downloading:
      status.phase === "downloading" &&
      `Downloading ${status.version}${status.percent === null ? "…" : ` · ${status.percent}%`}`,
    ready: status.phase === "ready" && `Version ${status.version} is installed`,
    error: status.phase === "error" && status.reason,
  }[status.phase];

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-surface px-4 py-3 ring-1 ring-line">
      <div className="flex min-w-0 flex-col">
        <span className="text-body text-fg">muffle v{__APP_VERSION__}</span>
        <span
          title={status.phase === "error" ? status.reason : undefined}
          className={cn("mt-0.5 truncate text-subheadline", status.phase === "error" ? "text-danger" : "text-muted")}
        >
          {text}
        </span>
      </div>
      {status.phase === "available" ? (
        <Button variant="primary" onClick={install}>
          Install
        </Button>
      ) : status.phase === "ready" ? (
        <Button variant="primary" onClick={restart}>
          Restart now
        </Button>
      ) : (
        <Button disabled={status.phase === "checking" || status.phase === "downloading"} onClick={checkNow}>
          Check now
        </Button>
      )}
    </div>
  );
}
