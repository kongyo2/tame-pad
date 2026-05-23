import type { Settings, SettingsPatch } from "./settings";

export type TamepadApi = {
  readonly getSettings: () => Promise<Settings>;
  readonly updateSettings: (patch: SettingsPatch) => Promise<Settings>;
  readonly writeClipboard: (text: string) => Promise<void>;
  readonly saveDraft: (text: string) => Promise<void>;
  readonly setExpanded: (expanded: boolean) => Promise<void>;
  readonly setPinned: (pinned: boolean) => Promise<void>;
  readonly setSnoozed: (snoozed: boolean) => Promise<void>;
  readonly quit: () => Promise<void>;
  readonly onExpansionChanged: (cb: (expanded: boolean) => void) => void;
  readonly onSnoozeChanged: (cb: (snoozed: boolean) => void) => void;
  readonly notifyReady: () => void;
  readonly onDraftQuery: (provide: () => string) => void;
};
