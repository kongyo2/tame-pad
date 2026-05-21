import { app, BrowserWindow, type Tray } from "electron";
import { loadSettings, saveSettings } from "./settings";
import { createMainWindow } from "./window";
import { createTray } from "./tray";
import { registerIpc } from "./ipc";
import { quitState } from "./quit-state";
import type { AppState } from "./state";

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

let appState: AppState | undefined;
let tray: Tray | undefined;

async function bootstrap(): Promise<void> {
  await app.whenReady();

  if (process.platform === "win32") {
    app.setAppUserModelId("com.kongyo2.tame-pad");
  }

  const settings = loadSettings();
  const windowManager = await createMainWindow(settings);
  appState = { settings, windowManager };
  tray = createTray();

  registerIpc(appState);

  app.on("activate", () => {
    if (appState !== undefined) {
      appState.windowManager.window.showInactive();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrap();
    }
  });

  app.on("second-instance", () => {
    if (appState !== undefined) {
      appState.windowManager.window.showInactive();
      appState.windowManager.setExpanded(true);
    }
  });
}

app.on("window-all-closed", () => {
  // No-op: the tray "終了" menu is the only intended exit.
  // Without this handler, Electron would auto-quit on non-darwin.
});

async function flushDraftFromRenderer(state: AppState): Promise<void> {
  const win = state.windowManager.window;
  if (win.isDestroyed() || win.webContents.isDestroyed()) return;
  try {
    const value: unknown = await win.webContents.executeJavaScript(
      `(() => { const el = document.getElementById('pad'); return el ? el.value : ''; })()`,
      true,
    );
    if (typeof value === "string" && value !== state.settings.draftText) {
      state.settings = { ...state.settings, draftText: value };
      saveSettings(state.settings);
    }
  } catch {
    // Renderer may have already torn down; ignore.
  }
}

app.on("before-quit", (event) => {
  if (quitState.quitting) return;
  event.preventDefault();
  quitState.quitting = true;
  const work = appState ? flushDraftFromRenderer(appState) : Promise.resolve();
  void work.finally(() => {
    if (tray !== undefined) {
      tray.destroy();
      tray = undefined;
    }
    app.quit();
  });
});

void bootstrap();
