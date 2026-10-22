import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type Snapshot } from "../services/tauri";

/**
 * Polls the backend while the window is visible. Hidden in the tray, the
 * timer keeps ticking but skips the call, so muffle costs nothing there.
 * Also refreshes right away when groups change (tray, other windows).
 */
export function useSnapshot(intervalMs: number) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await api.snapshot());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const unlisten = listen("groups-changed", () => refresh());
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      unlisten.then((off) => off());
    };
  }, [refresh, intervalMs]);

  return { snapshot, error, refresh };
}
