import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdaterStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "latest" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; version: string; percent: number | null }
  /** Installed in place; takes effect after a restart. */
  | { phase: "ready"; version: string }
  /** `version` is set when installing that version failed (not just a check). */
  | { phase: "error"; reason: string; version?: string };

export type Updater = {
  status: UpdaterStatus;
  checkNow: () => Promise<void>;
  install: () => Promise<void>;
  restart: () => Promise<void>;
};

// muffle mostly sits in the tray, so a check at launch alone goes stale.
const RECHECK_MS = 6 * 60 * 60 * 1000;

/**
 * App-wide update state. Holds one `Update` handle and closes the old one
 * before replacing it, so the Rust-side resource isn't leaked per check.
 */
export function useUpdater(): Updater {
  const [status, setStatus] = useState<UpdaterStatus>({ phase: "idle" });
  const updateRef = useRef<Update | null>(null);
  const busyRef = useRef(false);

  const replace = useCallback((next: Update | null) => {
    const previous = updateRef.current;
    updateRef.current = next;
    if (previous && previous !== next) previous.close().catch(() => {});
  }, []);

  const checkNow = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus({ phase: "checking" });
    try {
      const update = await check({ timeout: 15_000 });
      replace(update);
      setStatus(update ? { phase: "available", version: update.version } : { phase: "latest" });
    } catch (e) {
      setStatus({ phase: "error", reason: String(e) });
    } finally {
      busyRef.current = false;
    }
  }, [replace]);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update || busyRef.current) return;
    busyRef.current = true;
    const version = update.version;
    setStatus({ phase: "downloading", version, percent: null });
    try {
      let total = 0;
      let received = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          const percent = total ? Math.min(100, Math.round((received / total) * 100)) : null;
          setStatus({ phase: "downloading", version, percent });
        }
      });
      setStatus({ phase: "ready", version });
    } catch (e) {
      setStatus({ phase: "error", reason: String(e), version });
    } finally {
      busyRef.current = false;
    }
  }, []);

  const restart = useCallback(async () => {
    try {
      await relaunch();
    } catch (e) {
      setStatus({ phase: "error", reason: String(e) });
    }
  }, []);

  useEffect(() => {
    // Skipped in `pnpm dev`: there is no release to compare against.
    if (import.meta.env.DEV) return;
    checkNow();
    const timer = setInterval(() => {
      // Never interrupt a download or drop an installed update.
      if (!updateRef.current) checkNow();
    }, RECHECK_MS);
    return () => {
      clearInterval(timer);
      replace(null);
    };
  }, [checkNow, replace]);

  return { status, checkNow, install, restart };
}
