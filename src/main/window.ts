import { BrowserWindow, screen, type Display } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Settings } from "../shared/settings";
import { quitState } from "./quit-state";

const here = dirname(fileURLToPath(import.meta.url));

function pickDisplay(monitorIndex: number): Display {
  const displays = screen.getAllDisplays();
  return displays[monitorIndex] ?? screen.getPrimaryDisplay();
}

export type WindowManager = {
  window: BrowserWindow;
  setExpanded(expanded: boolean): void;
  isExpanded(): boolean;
  applySettings(next: Settings): void;
};

export async function createMainWindow(
  settings: Settings,
): Promise<WindowManager> {
  let current = settings;
  const display = pickDisplay(current.monitorIndex);
  const workArea = display.workArea;
  const initialWidth = current.collapsedWidth;
  const height = workArea.height;
  const x = workArea.x + workArea.width - initialWidth;
  const y = workArea.y;

  const win = new BrowserWindow({
    x,
    y,
    width: initialWidth,
    height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: true,
    focusable: true,
    show: false,
    type: "toolbar",
    webPreferences: {
      preload: join(here, "../preload/index.mjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);

  win.on("close", (event) => {
    // Tray "終了" is the only intended exit path. Block Alt+F4 and friends.
    if (!quitState.quitting) {
      event.preventDefault();
    }
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl !== undefined && devUrl !== "") {
    await win.loadURL(devUrl);
  } else {
    await win.loadFile(join(here, "../renderer/index.html"));
  }

  win.showInactive();

  let expanded = false;
  const reposition = (width: number): void => {
    const targetDisplay = pickDisplay(current.monitorIndex);
    const wa = targetDisplay.workArea;
    win.setBounds({
      x: wa.x + wa.width - width,
      y: wa.y,
      width,
      height: wa.height,
    });
  };

  const setExpanded = (next: boolean): void => {
    if (expanded === next) return;
    expanded = next;
    reposition(next ? current.expandedWidth : current.collapsedWidth);
  };

  const applySettings = (next: Settings): void => {
    const monitorChanged = next.monitorIndex !== current.monitorIndex;
    const widthChanged =
      next.expandedWidth !== current.expandedWidth ||
      next.collapsedWidth !== current.collapsedWidth;
    current = next;
    if (monitorChanged || widthChanged) {
      reposition(expanded ? current.expandedWidth : current.collapsedWidth);
    }
  };

  win.on("blur", () => {
    setExpanded(false);
  });

  return {
    window: win,
    setExpanded,
    isExpanded: () => expanded,
    applySettings,
  };
}
