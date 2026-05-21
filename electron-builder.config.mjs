/** @type {import('electron-builder').Configuration} */
export default {
  appId: "com.kongyo2.tame-pad",
  productName: "tame-pad",
  copyright: "Copyright (c) 2026 kongyo2",
  directories: {
    output: "dist",
    buildResources: "build",
  },
  files: ["out/**/*", "package.json", "!**/*.map"],
  asar: true,
  win: {
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "portable", arch: ["x64"] },
    ],
    icon: "build/icon.ico",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "tame-pad",
    // Distinct filename so the NSIS installer is never overwritten by the
    // portable build (both produce .exe and otherwise collide).
    artifactName: "${productName}-${version}-${arch}-Setup.${ext}",
  },
  portable: {
    artifactName: "${productName}-${version}-${arch}-portable.${ext}",
  },
  publish: null,
};
