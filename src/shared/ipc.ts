export const IpcChannel = {
  SettingsGet: "settings:get",
  SettingsUpdate: "settings:update",
  ClipboardWrite: "clipboard:write",
  DraftSave: "draft:save",
  WindowSetExpanded: "window:set-expanded",
  WindowQuit: "window:quit",
} as const;

export type IpcChannelValue = (typeof IpcChannel)[keyof typeof IpcChannel];
