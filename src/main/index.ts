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
let bootstrapping = false;
let pendingSecondInstance = false;

function focusAndExpand(state: AppState): void {
  state.windowManager.window.showInactive();
  state.windowManager.setExpanded(true, true);
}

// Register listeners that depend on lock ownership immediately so events
// emitted during the async bootstrap (before appState is ready) aren't lost.
app.on("second-instance", () => {
  if (appState === undefined) {
    // Queue the intent; bootstrap() replays it once appState is ready.
    pendingSecondInstance = true;
    return;
  }
  focusAndExpand(appState);
});

app.on("activate", () => {
  if (appState !== undefined) {
    appState.windowManager.window.showInactive();
  } else if (BrowserWindow.getAllWindows().length === 0) {
    void bootstrap();
  }
});

async function bootstrap(): Promise<void> {
  // Re-entry guard: activate can fire during initial bootstrap before
  // appState is set, which would double-register IPC handlers and throw.
  if (bootstrapping || appState !== undefined) return;
  bootstrapping = true;
  try {
    await app.whenReady();

    if (process.platform === "win32") {
      app.setAppUserModelId("com.kongyo2.tame-pad");
    }

    const settings = loadSettings();
    const windowManager = await createMainWindow(settings);
    appState = { settings, windowManager };
    tray = createTray();

    registerIpc(appState);

    // Windows shutdown / restart / logout does NOT emit app 'before-quit',
    // but BrowserWindow emits 'session-end' on the platform. Best-effort
    // flush via the same path so unsaved draft loss is minimized.
    appState.windowManager.window.on("session-end", () => {
      gracefulShutdown();
    });

    if (pendingSecondInstance) {
      pendingSecondInstance = false;
      focusAndExpand(appState);
    }
  } finally {
    bootstrapping = false;
  }
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

function gracefulShutdown(): void {
  if (quitState.quitting) return;
  quitState.quitting = true;
  const work = appState ? flushDraftFromRenderer(appState) : Promise.resolve();
  void work.finally(() => {
    if (tray !== undefined) {
      tray.destroy();
      tray = undefined;
    }
    app.quit();
  });
}

app.on("before-quit", (event) => {
  if (quitState.quitting) return;
  event.preventDefault();
  gracefulShutdown();
});

void bootstrap();
