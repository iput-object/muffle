export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function formatCpu(cpu: number): string {
  return cpu < 0.1 ? "0%" : `${cpu < 10 ? cpu.toFixed(1) : Math.round(cpu)}%`;
}

/** Elapsed time, two units at most: "45s", "12m", "2h 14m", "3d 4h". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60);
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return m ? `${m}m` : `${s}s`;
}

/** "Today 09:12", "Yesterday 22:40", "3 Nov 08:01". */
export function formatTime(ms: number): string {
  const at = new Date(ms);
  const clock = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = new Date(),
    yesterday = new Date();
  yesterday.setDate(day.getDate() - 1);
  if (at.toDateString() === day.toDateString()) return `Today ${clock}`;
  if (at.toDateString() === yesterday.toDateString()) return `Yesterday ${clock}`;
  return `${at.toLocaleDateString([], { day: "numeric", month: "short" })} ${clock}`;
}
