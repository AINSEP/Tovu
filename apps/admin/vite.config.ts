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
    // The `@jini-ai/*` deps are `file:` links straight into a sibling checkout (ADR-049 Decision
    // 7's temporary state, not the intended published-package boundary — see F1 in the fulldiff
    // audit). Vite resolves symlinks to their real path before checking `fs.allow`, so serving any
    // package asset a browser fetches at runtime (e.g. `RemixIcon`'s `import.meta.url`-relative
    // font/CSS) needs that real path allow-listed too, or Vite 403s it under `/@fs/`.
    fs: { allow: [path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../../Jini")] },
    proxy: {
      "/api": { target: process.env.TOVU_API_URL ?? "http://localhost:3000", changeOrigin: false },
      // `@jini-ai/chat-react`'s runtime picker requests agent icons from this root-relative path
      // (see `src/server/app.ts`'s matching route for why it can't just live under `/admin/`).
      "/agent-icons": { target: process.env.TOVU_API_URL ?? "http://localhost:3000", changeOrigin: false },
    },
  },
});
