import { z } from "zod";

// 設定ファイルにこのまま書き出される日本語の説明。JSON はコメントを
// 持てないので、_comments キーとして同梱して「設定ファイルを開く」
// 経由で編集する人がキーの意味を読めるようにする。
export const SETTINGS_HELP: Readonly<Record<string, string>> = {
  convertNewlines:
    "コピー時に改行をスペース1つに変換する (true=有効 / false=そのままコピー)",
  monitorIndex:
    "表示するモニターの番号 (0=メイン / 1=サブ ... 範囲外ならメインに自動切替)",
  expandedWidth: "展開時のパネル幅 (px / 200〜900)",
  collapsedWidth: "折りたたみ時の端ストリップ幅 (px / 2〜64)",
  opacityCollapsed:
    "折りたたみ時の不透明度 (0.05〜1.0 / 数値が小さいほど薄くなる)",
  opacityExpanded: "展開時の不透明度 (0.3〜1.0)",
  transitionMs: "展開/折りたたみアニメーションの長さ (ms / 0〜2000)",
  expandHoverDelayMs:
    "マウスが画面端に触れてから展開するまでの遅延 (ms / 0〜2000)",
  collapseDelayMs:
    "マウスがパネルを離れてから折りたたむまでの遅延 (ms / 0〜5000)",
  autosaveDebounceMs: "下書きの自動保存ディレイ (ms / 50〜5000)",
  fontSizePx: "テキストエリアのフォントサイズ (px / 8〜48)",
  edgeGrip:
    "折りたたみストリップの中央に『つまみ』マーカーを表示し、ただの線ではなく操作できるUIだと分かりやすくする (true=表示 / false=非表示)",
  idlePulse:
    "一定時間操作がないと端のストリップを数回ゆっくり明滅させて存在を知らせる (true=有効 / false=無効)",
  idlePulseDelayMs:
    "最後の操作からこの時間が過ぎたら明滅を始める (ms / 5000〜3600000 ・ 既定120000=2分)",
  idlePulsePeakOpacity:
    "明滅ピーク時の不透明度 (0.3〜1.0 / opacityCollapsed より大きくすると光って気付きやすい)",
  draftText: "保存された下書き本文 (アプリが自動で更新するので手動編集は不要)",
};

// .passthrough() で未知キーを保持する。.strict() だと手編集の typo (例:
// convertNewline と s 抜け) や旧バージョンの残骸で全体パースが落ち、
// loadSettings が DEFAULT_SETTINGS に巻き戻って draftText が消える。
// 未知キーはファイルに残せばユーザーが気付きやすく、stderr で警告するのは
// loadSettings 側の責務。
export const SettingsSchema = z
  .object({
    // _comments はドキュメント目的の読み取り専用フィールド。値は無視され、
    // 保存時に常に SETTINGS_HELP の最新版で上書きされる。
    _comments: z.unknown().optional(),
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
    edgeGrip: z.boolean().default(true),
    idlePulse: z.boolean().default(true),
    idlePulseDelayMs: z
      .number()
      .int()
      .min(5000)
      .max(3_600_000)
      .default(120_000),
    idlePulsePeakOpacity: z.number().min(0.3).max(1).default(0.85),
    draftText: z.string().default(""),
  })
  .passthrough();

export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsPatchSchema = SettingsSchema.partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
