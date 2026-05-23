import type { Settings } from "../shared/settings";
import type { TrayHandle } from "./tray";
import type { WindowManager } from "./window";

export type AppState = {
  settings: Settings;
  windowManager: WindowManager;
  // Populated after bootstrap publishes appState (so registerIpc, which
  // runs before tray creation, captures the same mutable container).
  // The snooze IPC handler reads this at call time to refresh the
  // checkbox in the tray menu.
  trayHandle?: TrayHandle;
};
