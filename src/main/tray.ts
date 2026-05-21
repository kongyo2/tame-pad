import { app, Menu, nativeImage, shell, Tray } from "electron";
import { dirname } from "node:path";
import {
  TRAY_ICON_PNG_2X_BASE64,
  TRAY_ICON_PNG_BASE64,
} from "./tray-icon-data";
import { getSettingsPath } from "./settings";

export function createTray(): Tray {
  const baseBuf = Buffer.from(TRAY_ICON_PNG_BASE64, "base64");
  const hiBuf = Buffer.from(TRAY_ICON_PNG_2X_BASE64, "base64");
  const image = nativeImage.createFromBuffer(baseBuf);
  image.addRepresentation({
    scaleFactor: 2,
    buffer: hiBuf,
    width: 32,
    height: 32,
  });

  const tray = new Tray(image);
  const version = app.getVersion();
  tray.setToolTip(`tame-pad v${version}`);
  const menu = Menu.buildFromTemplate([
    {
      label: `tame-pad v${version}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "設定ファイルを開く (JSON / 各キーの説明は _comments に記載)",
      click: () => {
        void shell.openPath(getSettingsPath());
      },
    },
    {
      label: "設定フォルダを開く",
      click: () => {
        void shell.openPath(dirname(getSettingsPath()));
      },
    },
    { type: "separator" },
    {
      label: "終了",
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  return tray;
}
