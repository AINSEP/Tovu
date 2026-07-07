import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The admin SPA is served at /admin by the Tovu server in production builds.
// In dev, Vite serves it at :5173 and proxies /api to the backend.
export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  resolve: {
    alias: {
      // Shared framework-agnostic shell metadata (see src/admin-shell INFO.md).
      "@tovu/admin-shell": path.resolve(__dirname, "../../src/admin-shell"),
      "@tovu/headless": path.resolve(__dirname, "../../src/headless"),
    },
  },
  server: {
    fs: { allow: [path.resolve(__dirname, "../..")] },
    proxy: {
      "/api": { target: process.env.TOVU_API_URL ?? "http://localhost:3000", changeOrigin: false },
    },
  },
});
