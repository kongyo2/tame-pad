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
  // Renderer → main, fired once init() has wired all listeners (including
  // the ExpansionChanged subscriber). Main gates second-instance focus on
  // this so an early replay can't broadcast into a renderer that hasn't
  // subscribed yet.
  RendererReady: "renderer:ready",
  // Main → renderer on graceful shutdown to harvest the current pad value
  // from the renderer's authoritative source (the textarea), instead of
  // executing JavaScript across the security boundary. Renderer answers
  // with DraftReply.
  DraftQuery: "draft:query",
  DraftReply: "draft:reply",
} as const;

export type IpcChannelValue = (typeof IpcChannel)[keyof typeof IpcChannel];
