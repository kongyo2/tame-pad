import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/main",
      lib: {
        entry: resolve(here, "src/main/index.ts"),
        formats: ["es"],
        fileName: () => "index.js",
      },
      rollupOptions: {
        output: { entryFileNames: "index.js" },
      },
    },
    resolve: {
      alias: { "@shared": resolve(here, "src/shared") },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/preload",
      lib: {
        entry: resolve(here, "src/preload/index.ts"),
        // Electron requires CommonJS for sandboxed preload scripts.
        formats: ["cjs"],
        fileName: () => "index.cjs",
      },
      rollupOptions: {
        output: { entryFileNames: "index.cjs" },
      },
    },
    resolve: {
      alias: { "@shared": resolve(here, "src/shared") },
    },
  },
  renderer: {
    root: resolve(here, "src/renderer"),
    build: {
      outDir: resolve(here, "out/renderer"),
      rollupOptions: {
        input: { index: resolve(here, "src/renderer/index.html") },
      },
    },
    resolve: {
      alias: { "@shared": resolve(here, "src/shared") },
    },
  },
});
