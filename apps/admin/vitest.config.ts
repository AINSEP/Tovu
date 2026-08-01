import { readFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * @file First-ever test harness for `apps/admin` (SPEC-005 REQ-12..17 dispatch). This app had
 * zero test infrastructure before this pass — a pre-existing gap, not introduced by this feature
 * — so this config is minimal, deliberately mirroring `vite.config.ts`'s existing alias/plugin
 * setup rather than inventing a second, divergent build configuration.
 */

/**
 * This package's own version, read at test-run time for `lib/app-version.ts`'s
 * `__TOVU_ADMIN_VERSION__` global. Mirrors `vite.config.ts`'s `adminPackageVersion` derivation
 * exactly (same `package.json` read, same field) rather than hardcoding a version string here,
 * so the two configs cannot drift apart — this was previously undefined under `vitest`, which
 * threw `ReferenceError: __TOVU_ADMIN_VERSION__ is not defined` at import time in any suite that
 * imports `App.tsx` (which imports `SettingsUi.tsx`, which imports `app-version.ts`), and had kept
 * three suites (`app-plugins-route`, `app-agent-page-identity`, `app-route-prototype-keys`) from
 * ever executing.
 */
const adminPackageVersion = (
  JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string }
).version;

export default defineConfig({
  define: {
    __TOVU_ADMIN_VERSION__: JSON.stringify(adminPackageVersion),
  },
  plugins: [react()],
  resolve: {
    /**
     * One React, one react-dom, no matter who imports them.
     *
     * `@jini-ai/ui` is a `file:` dependency symlinked into the sibling Jini checkout, which has its
     * own pnpm-installed React. Without this, `ChatPane` resolves Jini's copy while `react-dom`
     * renders with this app's, and the first hook it calls throws
     * `Cannot read properties of null (reading 'useContext')` — the classic two-Reacts symptom,
     * which reads like a bug in the component rather than a resolution problem.
     *
     * It surfaced as an unhandled error rather than a failure (the render is inside React's own
     * work loop, so the test that triggered it still passed), which is why it went unnoticed: any
     * admin test that mounts `App` renders the assistant dock, and therefore `ChatPane`.
     */
    dedupe: ["react", "react-dom"],
    alias: {
      "@tovu/admin-shell": path.resolve(__dirname, "../../src/admin-shell"),
      "@tovu/headless": path.resolve(__dirname, "../../src/headless"),
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      // Native fetch (undici) has no concept of "the current document URL" the way a real
      // browser does, so a RELATIVE fetch() call (as every apps/admin/src/lib/api.ts call makes)
      // fails to parse under jsdom's default blank test URL. Pinning an explicit origin here is
      // the standard fix — unrelated to (and does not affect) window.location.hash-based routing,
      // which apps/admin/src/App.tsx already reads directly.
      jsdom: { url: "http://localhost:3000/" },
    },
    globals: false,
    setupFiles: ["./src/__tests__/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
    },
  },
});
