import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Public site-assistant E2E config (SPEC-046 REQ-1..REQ-8, ADR-054) — the permanent home for
 * the browser measurements that found the two bugs fixed in `07a9e38` and `e5a1dbd`.
 *
 * A dedicated config, sibling to `playwright.a2ui.config.ts`, for reasons that are specific to this
 * suite rather than inherited habit:
 *
 * 1. **The widget does not exist on a page unless a ledger setting says so.**
 *    `site.assistant.public_enabled` defaults to `false`, and `render.ts#siteAssistantMarkup` emits
 *    NO mount div and NO `<script>` when it is off (`public-assistant-settings.ts`'s header: "a CSS
 *    or JavaScript-level hide is a defect against this contract"). So this suite needs a boot-time
 *    write that the shared VRT config must never carry — a config other suites boot against would be
 *    silently putting an LLM-backed public surface on every rendered page in those runs too.
 *    `globalSetup` below performs exactly that one write, against this suite's own server.
 * 2. **`playwright.config.ts`'s `webServer.command` is a repo-root-relative path run with `cwd`
 *    defaulting to this config's own directory** — the pre-existing bug `playwright.a2ui.config.ts`
 *    documents in full (confirmed live 2026-08-04, still unfixed and still out of scope here). This
 *    config sidesteps it the same way, with an explicit `webServer.cwd`.
 * 3. **The bundle under test is a build artifact, not source.** See `webServer.command`.
 *
 * ## No `GEMINI_API_KEY` is required, and the mocking is narrower than it looks
 *
 * Three of the four spec files intercept the widget's own `POST /api/site-assistant/chat` in the
 * BROWSER (`page.route`) and replay the exact `event:`/`data:` SSE framing `site-assistant.ts`'s
 * `sse()` writes. That is sound evidence rather than a convenience shortcut, and the reason is
 * specific: commit `7de3297` is a route-level integration test that asserts those bytes — event
 * name, JSON shape, D-1's `auto` flag, REQ-6's server-resolved target — against the REAL route with
 * only the outbound Gemini call stubbed. So the server half of the wire is proven permanently and at
 * byte level there; these specs prove the CLIENT half consumes that exact shape correctly, in a real
 * browser, against the real built bundle on a real themed page. Neither file is "the mocked one":
 * together they cover the full stack. What a live model would add is only "the model chose to call
 * the tool," which is not a property of this client code and is not worth a paid, quota-shared,
 * nondeterministic call on every run.
 *
 * `site-assistant-limits.spec.ts` is the exception and mocks nothing at all — see its own header.
 */
/**
 * Overridable so two agents (or two humans) can run this suite concurrently in the same checkout —
 * `reuseExistingServer: false` means each run boots its OWN server, and a second run on a taken port
 * fails at `webServer` startup with an error that says nothing about the collision. The daemon port
 * is derived rather than separately configurable so the two can never be set to disagree.
 */
const PORT = Number(process.env.TOVU_SITE_ASSISTANT_E2E_PORT ?? 4997);
const DAEMON_PORT = PORT - 1;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /site-assistant-.*\.spec\.ts/,
  /**
   * 45s, not the a2ui config's 30s: `site-assistant-highlight.spec.ts` measures a real ~20s
   * pulse→hold→fade lifecycle end to end, and that duration is the specified product behavior
   * (SPEC-046 §4), not test slack. Shortening the CSS to make the suite convenient would delete the
   * only property that test exists to prove — see that file's own header.
   */
  timeout: 45_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  /**
   * Deliberately 0 even in CI, unlike every sibling config. `site-assistant-limits.spec.ts` asserts
   * the exact request index at which the REAL per-IP rate limiter starts refusing, and that limiter
   * is a process-lifetime in-memory counter keyed by socket peer (`rate-limit.ts#resolveClientIp`
   * returns `socket.remoteAddress` unless trusted proxies are configured, and none are here) — so
   * every request in the whole run shares one budget and a retry cannot restore it. A retry would
   * therefore report a confident, wrong failure on a test that passed for real the first time.
   * Better to see the honest first result.
   */
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
    headless: true,
  },
  globalSetup: path.resolve(__dirname, "e2e/site-assistant.globalSetup.ts"),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    /**
     * Rebuilds `apps/site-chat/dist` before booting, for the same reason `playwright.config.ts`
     * boots a fresh in-memory server per run rather than reusing one: the artifact this suite
     * measures is a BUILD OUTPUT (`vite build --lib` → one self-mounting IIFE, served by
     * `site-chat-static.ts` at `/site-chat/site-assistant.js`), and `dist/` is gitignored. Without
     * this, the suite would silently measure whatever bundle happened to be on disk — a green run against
     * a stale bundle is the exact failure mode a fresh build per run exists to prevent, and it would
     * be invisible, since a stale bundle still mounts and still passes most assertions.
     *
     * Vite is invoked directly, not through `npm --prefix apps/site-chat run build`, because that
     * script's `postbuild` step runs `scripts/check-bundle-mounts.mjs` — a jsdom guard that VERIFIES
     * the artifact without changing it, measured at ~25s against vite's own ~4s. It has its own
     * invocation in the normal build path; skipping it here changes nothing about the bytes under
     * test, and 4s is cheap enough that nobody is tempted to comment this build step out.
     *
     * The binary is addressed by path (`apps/site-chat/node_modules/.bin/vite`) rather than `npx`:
     * vite is a dependency of that app only, not of the repo root, so a bare `npx vite` from
     * `REPO_ROOT` resolves to nothing (`sh: vite: command not found` — measured). The build root is
     * vite's positional argument; `--root` is not a recognized flag on `vite build` and fails the
     * CLI's own unknown-option check.
     *
     * `JINI_AGENT_DAEMON_PORT` pinned away from the default 4319 so this suite can never collide
     * with another Tovu dev instance's daemon subprocess on the same box.
     *
     * `GEMINI_API_KEY=` is blanked EXPLICITLY, and it is the least obvious line here. `webServer`
     * inherits the invoking shell's environment, and this owner has a real key — so on any machine
     * where it happens to be exported, `site-assistant-limits.spec.ts` would stop being free and
     * deterministic and start making ten real, billed, quota-shared model calls per run, while still
     * passing (its assertions are about status codes, not content, so nothing would ever surface the
     * spend). No spec in this suite needs a live model: three replay the server's own SSE framing in
     * the browser, and the limits spec deliberately relies on `handleChat` checking the rate limiter
     * BEFORE the API-key branch, so requests 1-10 land on the cheap `503 NOT_CONFIGURED` path and the
     * 11th on a real `429`. Blanking the key here is what makes that guarantee independent of whoever
     * runs the suite. A trailing `=` with no value is an empty string, which `env.GEMINI_API_KEY
     * ?.trim()` treats as absent — the same branch as unset.
     */
    command:
      `apps/site-chat/node_modules/.bin/vite build apps/site-chat --config apps/site-chat/vite.config.ts && ` +
      `GEMINI_API_KEY= PORT=${PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
    cwd: REPO_ROOT,
    url: BASE_URL,
    timeout: 90_000,
    reuseExistingServer: false,
  },
});
