/**
 * @file Live publish verification driver — NOT a test — launches a real, visible Chromium with a
 * CDP debug port open (`--remote-debugging-port=9333`) so `live-publish-verify-poll.mjs` can
 * reconnect and continue the SAME conversation turn by turn (`chromium.connectOverCDP`). Written
 * for the A1 re-verification pass (2026-08-16, see `ADS-memory/reports/verification/
 * 2026-08-16-live-publish-through-assistant.md`) because that pass needed an interactive,
 * multi-turn conversation with the real chat pane — reply, wait, read what the assistant actually
 * said, decide the next message — which a single fire-and-forget script (see
 * `live-publish-driver.mjs`'s own doc) cannot do.
 *
 * Deliberately `.mjs`, not `*.spec.ts`: same reasoning as `live-publish-driver.mjs` — a real
 * publish is irreversible and human-gated, so this can never run unattended in a suite.
 *
 * Logs in, opens the assistant dock, starts a FRESH conversation, and sends ONE prompt that
 * deliberately does not name a GitHub owner — that omission is the thing under test (does the
 * assistant now default it from the verified credential's account, ask, or invent one again?).
 * Then stays alive forever (never resolves) so the browser survives after this script's own
 * stdout is read — run it with `run_in_background`.
 *
 * Usage:
 *   node development/e2e/live-publish-verify-launch.mjs
 *   PUBLISH_PROMPT="..." node development/e2e/live-publish-verify-launch.mjs
 *
 * Then, from separate short-lived invocations:
 *   node development/e2e/live-publish-verify-poll.mjs read
 *   node development/e2e/live-publish-verify-poll.mjs send "some follow-up message"
 *   node development/e2e/live-publish-verify-poll.mjs click-publish
 *   ...see that file's own usage comment for the full action list.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.TOVU_ADMIN_URL ?? "http://localhost:5173";
const USERNAME = process.env.TOVU_ADMIN_USER ?? "admin";
const PASSWORD = process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev";
const PROMPT = process.env.PUBLISH_PROMPT ?? "Please publish this site to GitHub Pages.";

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (msg) => console.log(`[${stamp()}] ${msg}`);

const browser = await chromium.launch({
  headless: false,
  slowMo: 80,
  args: ["--remote-debugging-port=9333", "--window-size=1680,1050", "--window-position=40,40"],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
const page = await context.newPage();
page.on("pageerror", (e) => log(`  [pageerror] ${String(e).slice(0, 200)}`));

log("navigating to /admin/");
await page.goto(`${BASE}/admin/`, { waitUntil: "domcontentloaded" });
await page.locator(".login-card").waitFor({ state: "visible", timeout: 20_000 });
log(`signing in as ${USERNAME}`);
await page.getByLabel("Username").fill(USERNAME);
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: /sign in/i }).click();
await page.locator(".admin-layout").waitFor({ state: "visible", timeout: 20_000 });
log("authenticated shell mounted");

log("opening the assistant dock (starting a FRESH conversation via New)");
await page.locator(".chat-fab").click();
await page.locator(".admin-chat-dock.is-open").waitFor({ state: "visible", timeout: 15_000 });
// Force a brand-new conversation so nothing from a concurrent agent's own session leaks in.
const newBtn = page.locator(".admin-chat-dock button", { hasText: "New" });
if (await newBtn.count()) {
  await newBtn.first().click();
  await page.waitForTimeout(500);
}
await page.locator("textarea.jini-composer-input").waitFor({ state: "visible", timeout: 15_000 });

log(`PROMPT: ${PROMPT}`);
await page.locator("textarea.jini-composer-input").fill(PROMPT);
await page.locator("button.jini-composer-send").click();
log("sent. Reconnect via connectOverCDP (port 9333) from live-publish-verify-poll.mjs.");

await page.screenshot({ path: "development/e2e/.artifacts/pv-01-sent.png" }).catch(() => {});

// Keep this process (and therefore the browser) alive indefinitely.
await new Promise(() => {});
