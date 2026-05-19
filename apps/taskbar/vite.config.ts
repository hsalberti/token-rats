import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri expects a fixed port and doesn't tolerate fallbacks.
// See: https://v2.tauri.app/start/frontend/vite/
const host = process.env["TAURI_DEV_HOST"];

export default defineConfig({
  plugins: [react()],
  // Prevent vite from obscuring rust errors
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Ignore Rust target dir
      ignored: ["**/src-tauri/**"],
    },
  },
  // Build target compatible with Tauri's webview (recent Safari / Chromium).
  build: {
    target: ["es2022", "chrome105", "safari15"],
    minify: !process.env["TAURI_DEBUG"] ? "esbuild" : false,
    sourcemap: !!process.env["TAURI_DEBUG"],
  },
  envPrefix: ["VITE_", "TAURI_"],
});
