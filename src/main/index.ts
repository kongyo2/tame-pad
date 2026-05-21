import { app, BrowserWindow, ipcMain, type Tray } from "electron";
import { loadSettings, saveSettings } from "./settings";
import { createMainWindow, type WindowManager } from "./window";
import { createTray } from "./tray";
import { registerIpc, unregisterIpc } from "./ipc";
import { quitState } from "./quit-state";
import { IpcChannel } from "../shared/ipc";
import type { AppState } from "./state";

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

let appState: AppState | undefined;
let tray: Tray | undefined;
let bootstrapping = false;
let pendingSecondInstance = false;
let rendererReady = false;

function focusAndExpand(state: AppState): void {
  state.windowManager.window.showInactive();
  state.windowManager.setExpanded(true, true);
}

// Register listeners that depend on lock ownership immediately so events
// emitted during the async bootstrap (before appState is ready) aren't lost.
app.on("second-instance", () => {
  // Queue until the renderer has subscribed to ExpansionChanged. Otherwise
  // focusAndExpand's broadcast lands before onExpansionChanged is wired and
  // main/renderer expansion state drifts apart during startup.
  if (appState === undefined || !rendererReady) {
    pendingSecondInstance = true;
    return;
  }
  focusAndExpand(appState);
});

ipcMain.on(IpcChannel.RendererReady, () => {
  if (rendererReady) return;
  rendererReady = true;
  if (pendingSecondInstance && appState !== undefined) {
    pendingSecondInstance = false;
    focusAndExpand(appState);
  }
});

app.on("activate", () => {
  if (appState !== undefined) {
    appState.windowManager.window.showInactive();
  } else if (BrowserWindow.getAllWindows().length === 0) {
    startBootstrap();
  }
});

async function bootstrap(): Promise<void> {
  // Re-entry guard: activate can fire during initial bootstrap before
  // appState is set, which would double-register IPC handlers and throw.
  if (bootstrapping || appState !== undefined) return;
  bootstrapping = true;

  let windowManager: WindowManager | undefined;
  let ipcRegistered = false;
  try {
    await app.whenReady();

    if (process.platform === "win32") {
      app.setAppUserModelId("com.kongyo2.tame-pad");
    }

    const settings = loadSettings();
    windowManager = createMainWindow(settings);
    const candidateState: AppState = { settings, windowManager };

    // IPC handlers must be registered before the renderer loads, otherwise
    // the renderer's init() races and its getSettings() invoke rejects with
    // "No handler registered", which throws out of init() before any event
    // listeners are wired — and the pad refuses to expand on hover.
    registerIpc(candidateState);
    ipcRegistered = true;

    await windowManager.load();

    // Only publish appState after load() succeeds. If load() rejects (dev
    // server unreachable, missing asset, etc.), the catch below tears down
    // the partial state so a later activate event can retry bootstrap.
    appState = candidateState;
    tray = createTray();

    // Windows shutdown / restart / logout does NOT emit app 'before-quit',
    // but BrowserWindow emits 'session-end' on the platform. Best-effort
    // flush via the same path so unsaved draft loss is minimized.
    appState.windowManager.window.on("session-end", () => {
      gracefulShutdown();
    });

    // RendererReady can land before this point (init() sends it after the
    // microtask chain following did-finish-load, which is also when load()
    // resolves — order is non-deterministic). The RendererReady handler
    // skips focusAndExpand when appState is still undefined, so replay
    // any queued second-instance here too.
    if (pendingSecondInstance && rendererReady) {
      pendingSecondInstance = false;
      focusAndExpand(appState);
    }
  } catch (err) {
    if (ipcRegistered) unregisterIpc();
    if (windowManager !== undefined && !windowManager.window.isDestroyed()) {
      windowManager.window.destroy();
    }
    rendererReady = false;
    throw err;
  } finally {
    bootstrapping = false;
  }
}

function startBootstrap(): void {
  bootstrap().catch((err: unknown) => {
    // No window, no tray, no control surface — exit instead of leaving a
    // headless process. On macOS the dock-activate retry path is moot once
    // we've exited, but a permanent load failure (e.g. missing packaged
    // asset) won't recover on retry anyway, so failing fast is correct.
    process.stderr.write(`[tame-pad] bootstrap failed: ${String(err)}\n`);
    app.exit(1);
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

startBootstrap();
