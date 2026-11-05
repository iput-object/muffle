import { useEffect } from "react";

/** A request to bring one item into view and flash it; `n` changes on every request. */
export type Flash = { id: string; n: number } | null;

/**
 * Scrolls the element marked `data-flash-id={flash.id}` into view and plays the
 * accent flash on it, once the page has rendered its data (`ready`).
 */
export function useFlash(flash: Flash, ready: boolean) {
  const n = flash?.n;
  useEffect(() => {
    if (!flash || !ready) return;
    const el = document.querySelector<HTMLElement>(`[data-flash-id="${CSS.escape(flash.id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("flash");
    void el.offsetWidth; // restart the animation
    el.classList.add("flash");
    const timer = setTimeout(() => el.classList.remove("flash"), 2000);
    return () => clearTimeout(timer);
    // Only a new request (or the data arriving) should replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, ready]);
}
