import { useEffect, useRef } from "react";

/** Ctrl (or Cmd) + key → handler. Keys are matched on `KeyboardEvent.key`, lowercased. */
export function useShortcuts(map: Record<string, () => void>) {
  // Read through a ref so the listener is attached once and always sees fresh handlers.
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const handler = ref.current[e.key.toLowerCase()];
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
