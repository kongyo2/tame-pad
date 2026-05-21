import type { Settings } from "../shared/settings";
import type { WindowManager } from "./window";

export type AppState = {
  settings: Settings;
  windowManager: WindowManager;
};
