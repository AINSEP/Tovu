import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Hermetic config for `admin-composer-attachment-picker.spec.ts` — proof that the composer's
 * "+" file picker excludes no file type, and that a file selected through it really round-trips
 * through the daemon's `/api/attachments` route into a rendered attachment chip.
 *
 * Root cause this guards: the composer's `attachmentAccept` prop was hardcoded to `"image/*"`, so
 * the "+" button's native OS file dialog greyed out (or on some platforms, hid outright) any file
 * whose MIME type didn't start with `image/` — `.md` in particular, since macOS reports an EMPTY
 * MIME type for `.md`, which a MIME-only `accept` matches nothing against. The fix removed the prop
 * entirely rather than growing the allowlist, because the upload pipeline itself
 * (`@jini-ai/http-kit`'s `attachments.ts`) is kind-agnostic end to end — it sniffs
 * `detectAttachmentKind` from the leading bytes and stores `'image' | 'file'`, never rejecting on
 * MIME or extension. A picker filter here was pure friction with no matching restriction downstream.
 *
 * Sibling to `playwright.composer-agent-plugin-chip.config.ts` — same hermetic two-process boot
 * (real API server + real Vite-served admin, proxying `/api` to it), same `workers: 1` for the
 * shared `LOGIN_STRICT` rate limiter, same live-Vite-dev-mode dependency on `@jini-ai/chat`'s built
 * `dist/` for `.jini-composer-*`/`.jini-attachment-*` styles. Own config, own ports, per this
 * directory's "fresh, small, dedicated config per topic-specific spec" convention.
 *
 * Ports 8081/8082/8083: confirmed free via `lsof` on 2026-08-31, next unclaimed slot in this
 * directory's `+10`-per-config port ladder (last claimed triple: 8071/8072/8073).
 */
const API_PORT = 8081;
const ADMIN_PORT = 8082;
const DAEMON_PORT = 8083;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-composer-attachment-picker\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `PORT=${API_PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx apps/website/src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 30_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: `TOVU_API_URL=${API_BASE_URL} npx vite --port ${ADMIN_PORT} --strictPort`,
      cwd: ADMIN_ROOT,
      url: `${BASE_URL}/admin/`,
      timeout: 30_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
