import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_SETTINGS,
  SETTINGS_HELP,
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
    if (result.success) {
      // _comments を最新の SETTINGS_HELP で書き直すために再保存する。
      // 新しいキーが追加されたり説明が更新された後でも、ユーザーが
      // 「設定ファイルを開く」で最新のドキュメントを見られるようにする。
      saveSettings(result.data);
      return result.data;
    }
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
  // _comments を先頭に置きつつ、ユーザーが手動で書き換えた古い説明は
  // 常に上書きする。書き戻し時にキーの並び順が安定するよう、_comments を
  // 明示的に先頭にしている。
  const { _comments: _ignored, ...rest } = settings;
  const withHelp = { _comments: SETTINGS_HELP, ...rest };
  writeFileSync(filePath, `${JSON.stringify(withHelp, null, 2)}\n`, "utf8");
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
