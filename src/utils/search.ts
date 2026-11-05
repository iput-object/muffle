import type { GroupView, Startup, StartupItem, Unit } from "../services/tauri";
import { displayName, unitTitles } from "./displayName";

export type Hit =
  | { kind: "running"; key: string; title: string; detail: string; unit: Unit }
  | { kind: "group"; key: string; title: string; detail: string; group: GroupView }
  | { kind: "startup"; key: string; title: string; detail: string; item: StartupItem };

export type HitKind = Hit["kind"];

export type Results = Record<HitKind, Hit[]>;

/**
 * Lower is better: the title starts with the query, then a word in the title
 * does, then the title contains it, then only another field does.
 */
function rank(q: string, title: string, others: string[]): number | null {
  const t = title.toLowerCase();
  if (t.startsWith(q)) return 0;
  if (t.split(/[\s\-_.@/]+/).some((w) => w.startsWith(q))) return 1;
  if (t.includes(q)) return 2;
  if (others.some((o) => o.toLowerCase().includes(q))) return 3;
  return null;
}

function ranked<T extends { title: string }>(items: (T & { score: number | null })[]): T[] {
  return items
    .filter((i): i is T & { score: number } => i.score !== null)
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
    .map(({ score: _score, ...rest }) => rest as unknown as T);
}

export function search(query: string, data: { units: Unit[]; groups: GroupView[]; startup: Startup | null }): Results {
  const q = query.trim().toLowerCase();
  if (!q) return { running: [], group: [], startup: [] };

  const running = ranked(
    data.units
      .filter((u) => !u.protected)
      .map((unit) => {
        const { title, detail } = unitTitles(unit);
        return {
          kind: "running" as const,
          key: unit.id,
          title,
          detail,
          unit,
          score: rank(q, title, [unit.label, unit.name, unit.description]),
        };
      }),
  );

  const group = ranked(
    data.groups.map((g) => {
      const members = g.units.map((u) => displayName(u.label || u.name));
      const hitMember = g.units.find((u) =>
        [u.label, u.name, displayName(u.label || u.name)].some((s) => s.toLowerCase().includes(q)),
      );
      const nameScore = rank(q, g.name, []);
      return {
        kind: "group" as const,
        key: g.id,
        title: g.name,
        // When only a member matched, say which one.
        detail:
          nameScore === null && hitMember
            ? `Includes ${displayName(hitMember.label || hitMember.name)}`
            : members.slice(0, 3).join(", ") + (members.length > 3 ? ` +${members.length - 3}` : "") || "No members",
        group: g,
        score: nameScore ?? (hitMember ? 3 : null),
      };
    }),
  );

  const items = data.startup ? [...data.startup.apps, ...data.startup.services] : [];
  const startup = ranked(
    items.map((item) => {
      const { title, detail } = unitTitles(item);
      return {
        kind: "startup" as const,
        key: item.id,
        title,
        detail,
        item,
        score: rank(q, title, [item.label, item.name, item.description]),
      };
    }),
  );

  return { running, group, startup };
}
