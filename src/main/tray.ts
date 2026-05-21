import { app, Menu, nativeImage, shell, Tray } from "electron";
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
  tray.setToolTip("tame-pad");
  const menu = Menu.buildFromTemplate([
    {
      label: "設定ファイルを開く",
      click: () => {
        void shell.openPath(getSettingsPath());
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
