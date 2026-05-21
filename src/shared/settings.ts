import { z } from "zod";

export const SettingsSchema = z
  .object({
    convertNewlines: z.boolean().default(true),
    monitorIndex: z.number().int().min(0).default(0),
    expandedWidth: z.number().int().min(200).max(900).default(320),
    collapsedWidth: z.number().int().min(2).max(64).default(8),
    opacityCollapsed: z.number().min(0.05).max(1).default(0.35),
    opacityExpanded: z.number().min(0.3).max(1).default(1.0),
    transitionMs: z.number().int().min(0).max(2000).default(100),
    expandHoverDelayMs: z.number().int().min(0).max(2000).default(60),
    collapseDelayMs: z.number().int().min(0).max(5000).default(250),
    autosaveDebounceMs: z.number().int().min(50).max(5000).default(400),
    fontSizePx: z.number().int().min(8).max(48).default(14),
    draftText: z.string().default(""),
  })
  .strict();

export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsPatchSchema = SettingsSchema.partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
