import { app, clipboard, ipcMain } from "electron";
import { z } from "zod";
import { IpcChannel } from "../shared/ipc";
import { mergeSettings, saveSettings } from "./settings";
import type { AppState } from "./state";

const StringSchema = z.string();
const BooleanSchema = z.boolean();

const HANDLED_CHANNELS = [
  IpcChannel.SettingsGet,
  IpcChannel.SettingsUpdate,
  IpcChannel.ClipboardWrite,
  IpcChannel.DraftSave,
  IpcChannel.WindowSetExpanded,
  IpcChannel.WindowSetPinned,
  IpcChannel.WindowSetSnoozed,
  IpcChannel.WindowQuit,
] as const;

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

  ipcMain.handle(IpcChannel.WindowSetPinned, (_event, raw: unknown) => {
    const pinned = BooleanSchema.parse(raw);
    state.windowManager.setPinned(pinned);
  });

  ipcMain.handle(IpcChannel.WindowSetSnoozed, (_event, raw: unknown) => {
    const snoozed = BooleanSchema.parse(raw);
    // No broadcast: the renderer initiated this, so it's already updating
    // its own UI. Broadcasting would loop SnoozeChanged back to it.
    state.windowManager.setSnoozed(snoozed);
    // Tray menu checkbox is stale until rebuilt — keep it in sync so the
    // user can un-snooze from the tray after triggering snooze via the
    // title-bar button.
    state.trayHandle?.refresh();
  });

  ipcMain.handle(IpcChannel.WindowQuit, () => {
    // app.quit() goes through before-quit so the draft flush and tray
    // cleanup in src/main/index.ts run. app.exit() would skip both.
    app.quit();
  });
}

export function unregisterIpc(): void {
  for (const channel of HANDLED_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
}
