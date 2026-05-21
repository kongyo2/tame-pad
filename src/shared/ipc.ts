export const IpcChannel = {
  SettingsGet: "settings:get",
  SettingsUpdate: "settings:update",
  ClipboardWrite: "clipboard:write",
  DraftSave: "draft:save",
  WindowSetExpanded: "window:set-expanded",
  WindowQuit: "window:quit",
  // Main → renderer broadcast when main initiates an expansion change
  // (e.g. window blur, second-instance) so the renderer can sync its
  // classList without calling back into main.
  ExpansionChanged: "window:expansion-changed",
} as const;

export type IpcChannelValue = (typeof IpcChannel)[keyof typeof IpcChannel];
