import { contextBridge, ipcRenderer } from "electron";
import { IpcChannel } from "../shared/ipc";
import type { TamepadApi } from "../shared/api";
import type { Settings, SettingsPatch } from "../shared/settings";

const api: TamepadApi = {
  getSettings: () =>
    ipcRenderer.invoke(IpcChannel.SettingsGet) as Promise<Settings>,
  updateSettings: (patch: SettingsPatch) =>
    ipcRenderer.invoke(IpcChannel.SettingsUpdate, patch) as Promise<Settings>,
  writeClipboard: (text: string) =>
    ipcRenderer.invoke(IpcChannel.ClipboardWrite, text) as Promise<void>,
  saveDraft: (text: string) =>
    ipcRenderer.invoke(IpcChannel.DraftSave, text) as Promise<void>,
  setExpanded: (expanded: boolean) =>
    ipcRenderer.invoke(IpcChannel.WindowSetExpanded, expanded) as Promise<void>,
  quit: () => ipcRenderer.invoke(IpcChannel.WindowQuit) as Promise<void>,
  onExpansionChanged: (cb) => {
    ipcRenderer.on(IpcChannel.ExpansionChanged, (_event, expanded: boolean) => {
      cb(expanded);
    });
  },
  notifyReady: () => {
    ipcRenderer.send(IpcChannel.RendererReady);
  },
  onDraftQuery: (provide) => {
    ipcRenderer.on(IpcChannel.DraftQuery, () => {
      ipcRenderer.send(IpcChannel.DraftReply, provide());
    });
  },
};

contextBridge.exposeInMainWorld("tamepad", api);
