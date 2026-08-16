/**
 * @file Live publish driver — NOT a test. Drives a real, headed browser against the running
 * admin so the AI ASSISTANT performs a real static publish end to end (A1).
 *
 * The coordinator/operator running this never calls a publish API. The only thing that publishes
 * is `deployment_execute_static_publish`, which exists only inside the agent's own tool registry
 * (`src/features/deployments/publish-agent-tools.ts`). This driver types a request into the real
 * chat composer and then gets out of the way.
 *
 * Deliberately a `.mjs` driver rather than a `*.spec.ts`: a real publish is irreversible and
 * human-gated (the execute tool parks on an MCP-UI confirmation dialog a human must click), so it
 * can never run unattended in a suite. The `.mjs` extension and the "driver" name also keep it out
 * of every sibling playwright config's default `testMatch` (`.*(test|spec)\.(js|ts|mjs)`), which is
 * how an unscoped spec in this directory gets silently adopted by another config.
 *
 * Preconditions (all verified by the coordinator before the first run, 2026-08-16):
 * - Tovu server on :3000 and the admin vite dev server on :5173 (vite proxies /api to :3000).
 *   Drive :5173, NOT :3000/admin — `apps/admin/dist/` is a stale build (2026-08-13).
 * - `src/assistant/agent-daemon-server.ts` running.
 * - A saved publish credential for the target provider in `publish_credential_sets`.
 * - For github-pages: the repo must ALREADY EXIST. Jini's `GitHubPagesDeployTarget` creates the
 *   gh-pages branch and the Pages site, but never the repository itself.
 *
 * Verified selectors (read live from the mounted pane, not guessed):
 *   composer `textarea.jini-composer-input` · send `button.jini-composer-send`
 *   runtime picker `button.jini-runtime-trigger` (reads "Claude Code / Default model")
 *
 * Usage:
 *   node development/e2e/live-publish-driver.mjs
 *   PUBLISH_PROMPT="..." node development/e2e/live-publish-driver.mjs
 */
import { chromium } from "@playwright/test";

const BASE = process.env.TOVU_ADMIN_URL ?? "http://localhost:5173";
const USERNAME = process.env.TOVU_ADMIN_USER ?? "admin";
const PASSWORD = process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev";

const PROMPT =
  process.env.PUBLISH_PROMPT ??
  "Please publish this site to GitHub Pages. The repository is leonaburime-ucla/tovu-demo " +
    "(owner leonaburime-ucla, repo tovu-demo). Use \"First real publish\" as the project name. " +
    "Check publish readiness first and tell me what you find, then go ahead and publish.";

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (msg) => console.log(`[${stamp()}] ${msg}`);

const browser = await chromium.launch({
  headless: false,
  slowMo: 120,
  args: ["--window-size=1680,1050", "--window-position=40,40"],
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

log("opening the assistant dock");
await page.locator(".chat-fab").click();
await page.locator(".admin-chat-dock.is-open").waitFor({ state: "visible", timeout: 15_000 });
await page.locator("textarea.jini-composer-input").waitFor({ state: "visible", timeout: 15_000 });

const runtime = (await page.locator("button.jini-runtime-trigger").textContent().catch(() => "")) ?? "";
log(`chat pane ready — runtime: ${runtime.trim()}`);

log("typing the publish request into the real composer");
await page.locator("textarea.jini-composer-input").fill(PROMPT);
await page.locator("button.jini-composer-send").click();
log("sent. the assistant now owns this — watching for its tool calls\n");

/** Reads the visible conversation text, with <style>/<script> stripped (the pane inlines a large
 *  stylesheet whose text content would otherwise swamp every delta). */
async function readTranscript() {
  return page.evaluate(() => {
    const pane = document.querySelector(".jini-chat-pane") ?? document.querySelector(".admin-chat-dock");
    if (!pane) return "";
    const clone = pane.cloneNode(true);
    for (const el of clone.querySelectorAll("style, script")) el.remove();
    return (clone.textContent || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  });
}

/** MCP-UI surfaces (the publish confirmation dialog) render inside an iframe the host embeds. */
async function surfaceFrames() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".admin-chat-dock iframe")].map((f) => ({
      src: (f.getAttribute("src") || "").slice(0, 80),
      title: f.getAttribute("title"),
      h: Math.round(f.getBoundingClientRect().height),
    }))
  );
}

let seen = "";
let dialogAnnounced = false;
const deadline = Date.now() + 20 * 60 * 1000;

while (Date.now() < deadline) {
  await page.waitForTimeout(4000);

  const frames = await surfaceFrames();
  if (frames.length > 0 && !dialogAnnounced) {
    dialogAnnounced = true;
    log(`*** MCP-UI SURFACE RAISED (${frames.length} frame(s)): ${JSON.stringify(frames)}`);

    // WORKAROUND, not a fix. Measured 2026-08-16: the confirmation surface renders taller than
    // the pane's visible area (declared `preferredFrameSize: ["100%","360px"]` in
    // publish-agent-tools.ts, actually laid out at 560px) and the pane does NOT auto-scroll when a
    // surface is raised — so Publish/Cancel land BELOW the composer, off screen, and the operator
    // has to hunt for them. Scrolling here only spares the human that hunt during this run; the
    // product defect is untouched.
    await page.evaluate(() => {
      const dock = document.querySelector(".admin-chat-dock");
      const frame = dock?.querySelector("iframe");
      frame?.scrollIntoView({ block: "end" });
      for (const el of dock?.querySelectorAll("*") ?? []) {
        if (el.scrollHeight > el.clientHeight + 4 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY)) {
          el.scrollTop = el.scrollHeight;
        }
      }
    });
    log("*** scrolled the surface into view (workaround) ***");
    log("*** THIS IS THE HUMAN GATE — click Publish in the browser window. ***");
    await page.screenshot({ path: "development/e2e/.artifacts/publish-dialog.png" }).catch(() => {});
  }

  const now = await readTranscript();
  if (now.length > seen.length && now.startsWith(seen.slice(0, Math.min(seen.length, 200)))) {
    const delta = now.slice(seen.length).trim();
    if (delta) console.log(`[${stamp()}] +${delta}`);
  } else if (now !== seen) {
    console.log(`[${stamp()}] (transcript rewritten)\n${now.slice(-1500)}`);
  }
  seen = now;
}

log("20-minute window elapsed; leaving the browser open. Ctrl-C to close.");
await page.waitForTimeout(600_000);
await browser.close();
