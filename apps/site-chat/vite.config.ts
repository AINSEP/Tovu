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
  resolve: {
    /**
     * Diagnosed 2026-08-03 against a real browser (Playwright), one crash after the `define` fix
     * below: `TypeError: Cannot read properties of null (reading 'useRef')` — the classic signature
     * of two DIFFERENT React module instances ending up in one bundle (a hook call resolves against
     * a dispatcher React itself never set, because the "current" React that set it and the React the
     * hook call is running against are not the same module).
     *
     * Confirmed which two, by reading real files on disk, not by guessing: `@jini-ai/chat` and
     * `@jini-ai/ui` are `file:` links whose REAL path is inside the sibling `Jini/` checkout
     * (`apps/site-chat/node_modules/@jini-ai/chat` -> `../../../Jini/packages/chat`). Node/Rollup
     * module resolution walks up from a file's REAL location, and Jini has its OWN independently
     * `npm install`ed copies sitting right there —
     * `Jini/packages/chat/node_modules/react@19.2.7` and `Jini/packages/ui/node_modules/react@19.2.7`
     * — a different package instance, and a different version, than this app's own
     * `apps/site-chat/node_modules/react@19.2.8`. Whichever file happened to resolve first supplied
     * `useRef`'s dispatcher; the other's hook calls read a dispatcher React never populated. Bare
     * `resolve.dedupe` was tried first and did not fully close this (it dedupes multiple resolutions
     * Vite's own resolver sees, not a Jini-nested copy Rollup's commonjs/node-resolve plugins reach
     * independently while walking `@jini-ai/chat`'s real directory) — an explicit `alias` is what
     * actually pins every `react`/`react-dom` import, regardless of which file inside which real
     * directory issued it, to this app's own single copy. Every subpath below is one this bundle's
     * dependency graph genuinely imports (`react`, `react/jsx-runtime` via the `react()` plugin's
     * automatic JSX transform, `react-dom` via `@jini-ai/chat`'s internals, `react-dom/client` via
     * `main.tsx`) — not a blanket rewrite of every possible React entry point.
     */
    alias: {
      react: path.resolve(__dirname, "node_modules/react"),
      "react/jsx-runtime": path.resolve(__dirname, "node_modules/react/jsx-runtime"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "node_modules/react/jsx-dev-runtime"),
      "react-dom/client": path.resolve(__dirname, "node_modules/react-dom/client"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  /**
   * Diagnosed 2026-08-03 against a real browser (Playwright): the shipped IIFE threw
   * `ReferenceError: process is not defined` at load and never mounted. Root cause, confirmed by
   * reading the actual npm-published files, not assumed: `react-dom`'s `client.js`/`index.js` entry
   * points are plain CommonJS with an UNGUARDED `process.env.NODE_ENV` check (`checkDCE()`'s
   * dead-code-elimination self-test) that picks the dev vs. prod internal require — React ships no
   * alternate ESM entry that omits this, so there is no "resolve to the right build instead" fix
   * available. `apps/admin`'s built SPA has zero `process.env.NODE_ENV` occurrences in the same
   * React version, which is what pins the actual defect: Vite's normal (non-library) `build`
   * auto-injects this `define` itself; `build.lib` mode deliberately does not (a library build might
   * genuinely run under Node, where `process` is real, so Vite leaves the choice to the consumer).
   * This bundle is browser-only — an IIFE with no Node runtime underneath it — so defining it
   * unconditionally as `"production"` is correct here, not a paper-over: Rollup's minifier then
   * dead-code-eliminates the now-unreachable dev branches, so the literal string
   * `process.env.NODE_ENV` no longer appears in the output at all (verified: 0 occurrences,
   * `check-no-process-global.mjs`).
   *
   * The OTHER `process.*` reference `react-dom` ships (`process.emit(...)`, its dual-environment
   * uncaught-error reporter) is not touched by this and needs no fix: every call site is guarded by
   * `typeof process === "object" && typeof process.emit === "function"` first, which is safe with no
   * global `process` at all (`typeof` on an undeclared identifier never throws).
   */
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
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
