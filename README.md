# tame-pad

LLM CLI エージェント向けの、画面端に常駐するフローティング型クリップボードパッドです (Windows 11)。

画面の右端に細いストリップとして常時表示され、マウスを近づけると自動で展開してテキスト入力欄が現れます。書いた内容はワンクリックでクリップボードへコピーでき、CLI エージェントへ貼り付けやすいよう「改行をスペース1個に変換」するオプションも備えています。

## 特長

- **画面端ドッキング** — フレームレス・常時最前面・タスクバー非表示で右端に貼り付き、作業の邪魔をしません
- **ホバー展開 / 自動折りたたみ** — マウスが近づくと展開し、離れると自動で細いストリップに戻ります (遅延時間は設定可能)
- **CLI エージェント向けコピー** — 「改行をスペースに変換」をONにすると、コピー時に改行が半角スペース1個に置換され、CLI へ1行で貼り付けできます
- **下書き自動保存** — テキストエリアの内容はデバウンス付きで自動保存され、再起動後も復元されます
- **マルチモニター対応** — 表示先モニターを設定ファイルで切り替え可能
- **トレイ常駐** — トレイアイコンから設定ファイルやフォルダを開いたり、アプリを終了したりできます
- **IME対応** — 日本語入力中の変換確定前は折りたたみがブロックされます
- **シングルインスタンス** — 二重起動を防ぎ、再度起動した場合は既存ウィンドウを展開・フォーカスします

## インストール

[Releases](https://github.com/kongyo2/tame-pad/releases) ページから Windows 用ビルドを入手できます。

- `tame-pad-<version>-x64-Setup.exe` — NSIS インストーラー版 (スタートメニュー / デスクトップショートカット作成)
- `tame-pad-<version>-x64-portable.exe` — ポータブル版 (インストール不要)

## 使い方

1. アプリを起動すると、メインモニターの右端に細い縦ストリップが表示されます
2. ストリップにマウスカーソルを近づけるとパネルが展開します
3. テキストエリアに書き込み、`Copy` ボタンでクリップボードへコピーします
4. CLI へ1行で貼り付けたいときは、`改行をスペースに変換` にチェックを入れてから `Copy` を押します
5. パネルからマウスを離すと、自動で細いストリップに戻ります

### 終了方法

通常の `×` ボタンや `Alt+F4` ではアプリは終了しません。トレイアイコンを右クリックし、`終了` を選択してください。

## 設定

詳細な動作は JSON ファイルで調整できます。トレイアイコン右クリックメニューの `設定ファイルを開く` から `settings.json` を直接編集できます。

設定ファイルの場所:

```
%APPDATA%\tame-pad\settings.json
```

各キーの説明は、設定ファイルの先頭にある `_comments` セクションに同梱されています (JSON 形式の都合上コメント不可のため、アプリが自動的に最新の説明文を書き出します)。

主な設定項目:

| キー                 | デフォルト | 説明                                                          |
| -------------------- | ---------- | ------------------------------------------------------------- |
| `convertNewlines`    | `true`     | コピー時に改行をスペース1個に変換するか                       |
| `monitorIndex`       | `0`        | 表示するモニターの番号 (0=メイン / 1=サブ ...)                |
| `expandedWidth`      | `320`      | 展開時のパネル幅 (px / 200〜900)                              |
| `collapsedWidth`     | `8`        | 折りたたみ時の端ストリップ幅 (px / 2〜64)                     |
| `opacityCollapsed`   | `0.35`     | 折りたたみ時の不透明度 (0.05〜1.0)                            |
| `opacityExpanded`    | `1.0`      | 展開時の不透明度 (0.3〜1.0)                                   |
| `transitionMs`       | `100`      | 展開/折りたたみアニメーション長 (ms / 0〜2000)                |
| `expandHoverDelayMs` | `60`       | 画面端に触れてから展開するまでの遅延 (ms / 0〜2000)           |
| `collapseDelayMs`    | `250`      | マウスがパネルを離れてから折りたたむまでの遅延 (ms / 0〜5000) |
| `autosaveDebounceMs` | `400`      | 下書き自動保存のディレイ (ms / 50〜5000)                      |
| `fontSizePx`         | `14`       | テキストエリアのフォントサイズ (px / 8〜48)                   |
| `draftText`          | `""`       | 保存された下書き本文 (自動更新、手動編集は不要)               |

設定値が範囲外だったり JSON が壊れていたりした場合はデフォルト値で起動します。

## 開発

### 必要環境

- Node.js 22 以上
- npm

### セットアップ

```bash
npm ci
```

### 開発用に起動

```bash
npm run dev
```

`electron-vite` の HMR が有効な状態でアプリが起動します。

### ビルド

```bash
npm run build        # electron-vite で main / preload / renderer をビルド
npm run package:win  # Windows 向けインストーラー / ポータブル版を生成 (dist/)
```

### 品質チェック

```bash
npm run lint         # oxlint
npm run lint:strict  # 警告も失敗扱い (CI と同じ)
npm run typecheck    # main / renderer 両方の tsc --noEmit
npm run format       # Prettier で整形
npm run format:check # 整形差分が無いか確認
```

## 技術スタック

- [Electron](https://www.electronjs.org/) — デスクトップアプリ基盤
- [electron-vite](https://electron-vite.org/) — Vite ベースのビルドツール
- [electron-builder](https://www.electron.build/) — Windows 向けパッケージング (NSIS / portable)
- [TypeScript](https://www.typescriptlang.org/) — 型付き JavaScript
- [Zod](https://zod.dev/) — 設定ファイルのスキーマ検証
- [oxlint](https://oxc.rs/docs/guide/usage/linter) / [Prettier](https://prettier.io/) — リンター・フォーマッター

## プロジェクト構成

```
src/
├── main/       Electron メインプロセス (ウィンドウ管理 / トレイ / IPC / 設定永続化)
├── preload/    プリロードスクリプト (renderer に安全に API を露出)
├── renderer/   UI 層 (HTML / CSS / TypeScript)
└── shared/     main と renderer で共有する型・スキーマ・IPC チャネル定義
```

## ライセンス

[MIT License](./LICENSE) — Copyright (c) 2026 kongyo2
