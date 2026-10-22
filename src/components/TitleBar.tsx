import type { ReactNode } from "react";
import { WindowControls } from "./WindowControls";

/** Drag strip above the page, with its title, optional page tools and the window controls. */
export function TitleBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-3 pl-5"
    >
      <h1 className="pointer-events-none flex-1 text-title3">{title}</h1>
      {children && (
        <>
          {children}
          <div className="mx-1 h-4 w-px bg-line" />
        </>
      )}
      <WindowControls />
    </header>
  );
}
