import { getCurrentWindow } from "@tauri-apps/api/window";
import { Cancel01Icon, MinusSignIcon } from "@hugeicons/core-free-icons";
import { IconButton } from "./ui/IconButton";

/** Minimize and close-to-tray, for the undecorated window. */
export function WindowControls() {
  const appWindow = getCurrentWindow();
  return (
    <div className="flex items-center gap-1">
      <IconButton icon={MinusSignIcon} label="Minimize" onClick={() => appWindow.minimize()} />
      <IconButton
        icon={Cancel01Icon}
        label="Hide to tray"
        onClick={() => appWindow.hide()}
        className="text-muted hover:bg-danger hover:text-bg"
      />
    </div>
  );
}
