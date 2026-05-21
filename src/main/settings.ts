import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
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

// 全体パースが落ちた時にフィールド単位で救済する。値が不正なフィールドは
// DEFAULT_SETTINGS の対応値で埋め、未知キーは passthrough のまま残す。
// 「typo 1 個でユーザーの draftText が全部消える」 のを防ぐためのリカバリ。
function recoverSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    process.stderr.write(
      `[tame-pad] settings root is not an object, using defaults\n`,
    );
    return DEFAULT_SETTINGS;
  }
  const obj = raw as Record<string, unknown>;
  const shape = SettingsSchema.shape;
  // obj をベースにすることで未知キーを残し、既知キーだけを上書きする。
  const candidate: Record<string, unknown> = { ...obj };
  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (key === "_comments") continue;
    if (!(key in obj)) {
      candidate[key] = (DEFAULT_SETTINGS as Record<string, unknown>)[key];
      continue;
    }
    const fieldResult = fieldSchema.safeParse(obj[key]);
    if (fieldResult.success) {
      candidate[key] = fieldResult.data;
    } else {
      process.stderr.write(
        `[tame-pad] settings.${key} invalid, using default: ${JSON.stringify(fieldResult.error.flatten())}\n`,
      );
      candidate[key] = (DEFAULT_SETTINGS as Record<string, unknown>)[key];
    }
  }
  return SettingsSchema.parse(candidate);
}

function warnUnknownKeys(raw: unknown): void {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return;
  const shape = SettingsSchema.shape;
  for (const key of Object.keys(raw as Record<string, unknown>)) {
    if (key === "_comments") continue;
    if (!(key in shape)) {
      process.stderr.write(
        `[tame-pad] settings.${key} unknown (kept in file but ignored)\n`,
      );
    }
  }
}

export function loadSettings(): Settings {
  const filePath = getSettingsPath();
  if (!existsSync(filePath)) {
    saveSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    process.stderr.write(
      `[tame-pad] settings JSON parse failed, using defaults: ${String(err)}\n`,
    );
    return DEFAULT_SETTINGS;
  }
  warnUnknownKeys(parsed);
  const result = SettingsSchema.safeParse(parsed);
  let settings: Settings;
  if (result.success) {
    settings = result.data;
  } else {
    process.stderr.write(
      `[tame-pad] some settings invalid, recovering per-field: ${JSON.stringify(result.error.flatten())}\n`,
    );
    settings = recoverSettings(parsed);
  }
  // _comments を最新の SETTINGS_HELP で書き直すために再保存する。
  // 新しいキーが追加されたり説明が更新された後でも、ユーザーが
  // 「設定ファイルを開く」で最新のドキュメントを見られるようにする。
  // ただし読み取りが成功した以上、書き戻しが失敗してもパース済みの
  // 設定で起動を続ける — read-only プロファイルやロック中ファイルで
  // 既存ユーザー設定を破棄して DEFAULT_SETTINGS に巻き戻さないため。
  try {
    saveSettings(settings);
  } catch (err) {
    process.stderr.write(
      `[tame-pad] could not refresh settings _comments (continuing with parsed values): ${String(err)}\n`,
    );
  }
  return settings;
}

export function saveSettings(settings: Settings): void {
  const filePath = getSettingsPath();
  ensureDir(filePath);
  // _comments を先頭に置きつつ、ユーザーが手動で書き換えた古い説明は
  // 常に上書きする。書き戻し時にキーの並び順が安定するよう、_comments を
  // 明示的に先頭にしている。
  const { _comments: _ignored, ...rest } = settings;
  const withHelp = { _comments: SETTINGS_HELP, ...rest };
  // テンポラリに書いて rename することで、書き込み中クラッシュでも
  // settings.json が truncate された状態で残らない。同一 FS なら rename は
  // atomic (POSIX / NTFS とも保証)。
  const payload = `${JSON.stringify(withHelp, null, 2)}\n`;
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, payload, "utf8");
  renameSync(tmp, filePath);
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
