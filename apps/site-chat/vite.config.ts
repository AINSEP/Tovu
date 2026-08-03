import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The public site chat bundle (ADR-054 Task 2/3): a second browser build target, served to
// anonymous visitors on every page of every theme. Distinct from `apps/admin` in every way that
// matters for that audience — see this repo's `apps/admin/vite.config.ts` for the admin SPA this
// deliberately does NOT reuse.

/**
 * Fails the build loudly if anything in this bundle resolves into `apps/admin`. ADR-054's own
 * "Costs and open risks" section calls this out by name: "an accidental import would ship admin
 * internals to anonymous visitors," and asks for a check rather than relying on review to catch it.
 *
 * Checked in `load()`, not `resolveId()` — `load()` receives the fully RESOLVED absolute file path
 * after alias/relative-path resolution, so this catches every way an import could reach
 * `apps/admin` (a relative `../../admin/...`, a future path alias, a transitive import inside a
 * shared file) rather than only ones that spell "admin" in the import specifier itself.
 */
const forbidAdminImports: Plugin = {
  name: "tovu:forbid-admin-imports",
  enforce: "pre",
  load(id) {
    if (id.includes(`${path.sep}apps${path.sep}admin${path.sep}`)) {
      throw new Error(
        `tovu:forbid-admin-imports: "${id}" resolves into apps/admin. The public site-chat bundle ` +
          "must not ship admin internals to anonymous visitors (ADR-054) — reuse the shared " +
          "@jini-ai/chat/react components directly instead of importing through apps/admin.",
      );
    }
    return null; // Defer to Vite's normal loader; this plugin only ever vetoes, never supplies content.
  },
};

export default defineConfig({
  plugins: [forbidAdminImports, react()],
  build: {
    outDir: "dist",
    cssCodeSplit: false,
    // Library mode, not an app build: this produces one self-mounting script a themed HTML page
    // can `<script defer src="...">`, not an `index.html`-rooted SPA — see `src/main.tsx`'s header.
    lib: {
      entry: path.resolve(__dirname, "src/main.tsx"),
      name: "TovuSiteAssistant",
      formats: ["iife"],
      fileName: () => "site-assistant.js",
    },
    rollupOptions: {
      output: { assetFileNames: "site-assistant.[ext]" },
    },
  },
  server: {
    // Same shape as `apps/admin/vite.config.ts`'s allowlist, for the same reason: the `@jini-ai/*`
    // deps are `file:` links into a sibling checkout, and Vite resolves symlinks to their real path
    // before checking `fs.allow`.
    fs: { allow: [path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../../Jini")] },
    proxy: {
      "/api": { target: process.env.TOVU_API_URL ?? "http://localhost:3000", changeOrigin: false },
    },
  },
});
