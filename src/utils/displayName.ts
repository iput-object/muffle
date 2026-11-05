/**
 * Friendlier names for the UI. The real unit or app id is always kept and shown
 * as the secondary line; this only tidies what reads as the title.
 */

const HEX_TAIL = /^(.*?)[-_.]([0-9a-f]{12,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
// org.gnome.Nautilus, com.github.foo.Bar, io.missioncenter.MissionCenter
const REVERSE_DNS = /^[a-z][a-z0-9-]*(\.[A-Za-z0-9_-]+){2,}$/;

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "MissionCenter" → "Mission Center", "text-editor" → "Text Editor". */
function words(s: string) {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(capitalize)
    .join(" ");
}

export function displayName(label: string): string {
  const raw = label.trim();
  if (!raw || /\s/.test(raw)) return raw;

  // Instance suffix (`foo@wayland`, `postgresql@16-main`) belongs to the id, not the name.
  const [base, instance] = raw.split("@");

  if (REVERSE_DNS.test(base)) {
    const name = words(base.split(".").pop()!);
    return instance && !/^(wayland|x11)$/i.test(instance) ? `${name} (${instance})` : name;
  }

  const hashed = base.match(HEX_TAIL);
  if (hashed) {
    const [, stem, hash] = hashed;
    const short = hash.slice(0, 8);
    if (/^docker$/i.test(stem)) return `Docker container ${short}`;
    if (/^vte-spawn$/i.test(stem)) return `Terminal session ${short}`;
    return `${stem} ${short}`;
  }

  return raw;
}

/**
 * Title and secondary line for a running unit or startup item. When the id gets
 * tidied, the id itself becomes the secondary line (shown in mono), and a short
 * description, if there is one, makes a better title than the tidied id.
 */
export function unitTitles(u: { kind: "app" | "service"; name: string; label: string; description: string }): {
  title: string;
  detail: string;
  /** The detail is an id, set in mono. */
  detailIsId: boolean;
} {
  const tidy = displayName(u.label || u.name);
  const renamed = tidy !== (u.label || u.name);
  // A description that only repeats the name says nothing.
  const desc = u.description.trim().toLowerCase() === (u.label || u.name).toLowerCase() ? "" : u.description.trim();
  if (u.kind === "service" && !renamed) {
    return desc ? { title: tidy, detail: desc, detailIsId: false } : { title: tidy, detail: u.name, detailIsId: true };
  }
  const title = u.kind === "service" && renamed && desc && desc.length <= 32 ? desc : tidy;
  return { title, detail: u.kind === "service" ? u.label || u.name : u.name, detailIsId: true };
}

/** One letter for a monogram tile. */
export function monogram(name: string): string {
  const m = name.match(/[A-Za-z0-9]/);
  return m ? m[0].toUpperCase() : "·";
}
