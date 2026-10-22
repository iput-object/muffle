import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Activity01Icon, Layers01Icon, Rocket01Icon, Settings02Icon } from "@hugeicons/core-free-icons";
import logo from "../assets/logo.svg";
import { cn } from "../utils/cn";

export type Page = "running" | "groups" | "startup" | "settings";

const ITEMS: { page: Page; label: string; icon: IconSvgElement }[] = [
  { page: "running", label: "Running", icon: Activity01Icon },
  { page: "groups", label: "Groups", icon: Layers01Icon },
  { page: "startup", label: "Startup", icon: Rocket01Icon },
];

export const PAGE_TITLES: Record<Page, string> = {
  running: "Running",
  groups: "Groups",
  startup: "Startup",
  settings: "Settings",
};

type SidebarProps = {
  page: Page;
  onNavigate: (page: Page) => void;
  /** Small counts shown beside nav items. */
  counts?: Partial<Record<Page, number>>;
};

export function Sidebar({ page, onNavigate, counts }: SidebarProps) {
  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-line bg-surface">
      <div data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-2 px-4">
        <img src={logo} alt="" className="pointer-events-none h-5 w-5" />
        <span className="pointer-events-none text-headline">muffle</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {ITEMS.map((item) => (
          <NavItem
            key={item.page}
            {...item}
            count={counts?.[item.page]}
            active={page === item.page}
            onClick={() => onNavigate(item.page)}
          />
        ))}
      </nav>

      <div className="flex flex-col border-t border-line px-2 py-2">
        <NavItem
          label="Settings"
          icon={Settings02Icon}
          active={page === "settings"}
          onClick={() => onNavigate("settings")}
        />
      </div>
    </aside>
  );
}

type NavItemProps = {
  label: string;
  icon: IconSvgElement;
  active: boolean;
  count?: number;
  onClick: () => void;
};

function NavItem({ label, icon, active, count, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-7 items-center gap-2.5 rounded-md px-2.5 text-body transition-colors",
        active ? "bg-raised text-fg" : "text-muted hover:bg-raised/60 hover:text-fg",
      )}
    >
      <HugeiconsIcon
        icon={icon}
        size={16}
        strokeWidth={1.8}
        className={active ? "text-accent" : undefined}
      />
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-subheadline tabular-nums text-dim">{count}</span>
      )}
    </button>
  );
}
