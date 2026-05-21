import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_SETTINGS,
  SettingsPatchSchema,
  SettingsSchema,
  type Settings,
  type SettingsPatch,
} from "../shared/settings";

const SETTINGS_FILENAME = "settings.json";

export function getSettingsPath(): string {
  return join(app.getPath("userData"), SETTINGS_FILENAME);
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadSettings(): Settings {
  const filePath = getSettingsPath();
  if (!existsSync(filePath)) {
    saveSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    const result = SettingsSchema.safeParse(parsed);
    if (result.success) return result.data;
    process.stderr.write(
      `[tame-pad] invalid settings file, falling back to defaults: ${JSON.stringify(result.error.flatten())}\n`,
    );
    return DEFAULT_SETTINGS;
  } catch (err) {
    process.stderr.write(
      `[tame-pad] settings read failed, using defaults: ${String(err)}\n`,
    );
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  const filePath = getSettingsPath();
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

export function mergeSettings(current: Settings, rawPatch: unknown): Settings {
  const patchResult = SettingsPatchSchema.safeParse(rawPatch);
  if (!patchResult.success) {
    throw new Error(`Invalid settings patch: ${patchResult.error.message}`);
  }
  const patch: SettingsPatch = patchResult.data;
  const merged = SettingsSchema.parse({ ...current, ...patch });
  return merged;
}
