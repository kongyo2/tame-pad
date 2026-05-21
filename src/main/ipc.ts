import { app, clipboard, ipcMain } from "electron";
import { z } from "zod";
import { IpcChannel } from "../shared/ipc";
import { mergeSettings, saveSettings } from "./settings";
import type { AppState } from "./state";

const StringSchema = z.string();
const BooleanSchema = z.boolean();

export function registerIpc(state: AppState): void {
  ipcMain.handle(IpcChannel.SettingsGet, () => state.settings);

  ipcMain.handle(IpcChannel.SettingsUpdate, (_event, rawPatch: unknown) => {
    const next = mergeSettings(state.settings, rawPatch);
    state.settings = next;
    saveSettings(next);
    state.windowManager.applySettings(next);
    return next;
  });

  ipcMain.handle(IpcChannel.ClipboardWrite, (_event, rawText: unknown) => {
    const text = StringSchema.parse(rawText);
    clipboard.writeText(text);
  });

  ipcMain.handle(IpcChannel.DraftSave, (_event, rawText: unknown) => {
    const text = StringSchema.parse(rawText);
    if (text === state.settings.draftText) return;
    state.settings = { ...state.settings, draftText: text };
    saveSettings(state.settings);
  });

  ipcMain.handle(IpcChannel.WindowSetExpanded, (_event, raw: unknown) => {
    const expanded = BooleanSchema.parse(raw);
    state.windowManager.setExpanded(expanded);
  });

  ipcMain.handle(IpcChannel.WindowQuit, () => {
    // app.quit() goes through before-quit so the draft flush and tray
    // cleanup in src/main/index.ts run. app.exit() would skip both.
    app.quit();
  });
}
