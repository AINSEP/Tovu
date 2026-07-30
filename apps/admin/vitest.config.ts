import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * @file First-ever test harness for `apps/admin` (SPEC-005 REQ-12..17 dispatch). This app had
 * zero test infrastructure before this pass — a pre-existing gap, not introduced by this feature
 * — so this config is minimal, deliberately mirroring `vite.config.ts`'s existing alias/plugin
 * setup rather than inventing a second, divergent build configuration.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
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
