/**
 * @file Live publish verification driver — NOT a test — reconnects over CDP to the browser started
 * by `live-publish-verify-launch.mjs` and performs ONE action against the live page, then exits,
 * leaving the remote browser process untouched (`connectOverCDP` never owns/closes it, and this
 * file deliberately never calls `browser.close()` — see the bottom comment). Written for the same
 * A1 re-verification pass as that file; see its own header for why this needed to be interactive
 * rather than one fire-and-forget script.
 *
 * Usage:
 *   node development/e2e/live-publish-verify-poll.mjs read                    — dump the visible
 *     chat transcript (style/script stripped) and any MCP-UI surface iframes currently mounted
 *   node development/e2e/live-publish-verify-poll.mjs wait-read [ms]          — wait, then read
 *   node development/e2e/live-publish-verify-poll.mjs send "<message>"        — type + submit
 *   node development/e2e/live-publish-verify-poll.mjs click-publish           — clicks the
 *     "Publish" button inside the MCP-UI confirmation iframe (real buttons live in a sandboxed
 *     iframe, unreachable from the parent document — see `McpUiSurfaceCard` / project memory on
 *     MCP-UI surface driveability)
 *   node development/e2e/live-publish-verify-poll.mjs click-cancel            — same, for Cancel
 *   node development/e2e/live-publish-verify-poll.mjs screenshot <name>       — full-page PNG to
 *     development/e2e/.artifacts/<name>.png
 *   node development/e2e/live-publish-verify-poll.mjs click-sel "<css>"       — click a CSS
 *     selector in the main document (chrome around the chat pane, not inside an MCP-UI iframe)
 *   node development/e2e/live-publish-verify-poll.mjs click-text "<text>"     — click the first
 *     element whose text contains this substring
 *   node development/e2e/live-publish-verify-poll.mjs goto "<path>"           — full navigation
 *     (note: this closes the assistant dock; reopen with `click-sel .chat-fab` and reselect the
 *     conversation via `click-sel button.jini-conv-trigger` + `click-text "<conversation title>"`)
 *   node development/e2e/live-publish-verify-poll.mjs api "METHOD /api/..."   — authenticated
 *     same-origin fetch from the live page's own session (for exercising a route the UI itself
 *     never calls — e.g. confirming a backend capability exists independent of its UI wiring)
 *   node development/e2e/live-publish-verify-poll.mjs frames-detail           — list every frame's
 *     URL and its buttons' text content (for finding what a newly-raised iframe actually contains)
 */
import { chromium } from "@playwright/test";

const action = process.argv[2] ?? "read";
const arg = process.argv.slice(3).join(" ");

const browser = await chromium.connectOverCDP("http://localhost:9333");
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes("localhost:5173")) ?? context.pages()[0];

async function readTranscript() {
  return page.evaluate(() => {
    const pane = document.querySelector(".jini-chat-pane") ?? document.querySelector(".admin-chat-dock");
    if (!pane) return "";
    const clone = pane.cloneNode(true);
    for (const el of clone.querySelectorAll("style, script")) el.remove();
    return (clone.textContent || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  });
}

async function surfaceFrames() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".admin-chat-dock iframe")].map((f) => ({
      src: (f.getAttribute("src") || "").slice(0, 120),
      title: f.getAttribute("title"),
      h: Math.round(f.getBoundingClientRect().height),
    }))
  );
}

if (action === "wait-read") {
  await page.waitForTimeout(Number(arg) || 15000);
  console.log("=== TRANSCRIPT (after wait) ===");
  console.log(await readTranscript());
  console.log("=== IFRAMES ===");
  console.log(JSON.stringify(await surfaceFrames(), null, 1));
} else if (action === "read") {
  console.log("=== TRANSCRIPT ===");
  console.log(await readTranscript());
  console.log("=== IFRAMES ===");
  console.log(JSON.stringify(await surfaceFrames(), null, 1));
} else if (action === "send") {
  await page.locator("textarea.jini-composer-input").fill(arg);
  await page.locator("button.jini-composer-send").click();
  console.log(`sent: ${arg}`);
} else if (action === "click-publish" || action === "click-cancel") {
  const label = action === "click-publish" ? "Publish" : "Cancel";
  const frames = page.frames().filter((f) => f !== page.mainFrame());
  let clicked = false;
  for (const f of frames) {
    const btn = f.getByRole("button", { name: label, exact: true });
    if (await btn.count().catch(() => 0)) {
      await btn.first().scrollIntoViewIfNeeded().catch(() => {});
      await btn.first().click({ timeout: 5000 }).catch(async (e) => {
        console.log(`click failed in frame ${f.url()}: ${e.message}`);
      });
      clicked = true;
      console.log(`clicked "${label}" in frame ${f.url().slice(0, 100)}`);
      break;
    }
  }
  if (!clicked) console.log(`NO frame contained a "${label}" button. Frames: ${frames.map((f) => f.url()).join(", ")}`);
} else if (action === "screenshot") {
  const name = arg || "pv-shot";
  await page.screenshot({ path: `development/e2e/.artifacts/${name}.png`, fullPage: true });
  console.log(`screenshot: development/e2e/.artifacts/${name}.png`);
} else if (action === "click-sel") {
  await page.locator(arg).first().click({ timeout: 5000 });
  console.log(`clicked selector: ${arg}`);
} else if (action === "api") {
  // arg format: "METHOD path" e.g. "GET /api/admin/v1/workspaces/workspace-local/system/publish/credentials"
  const [method, ...rest] = arg.split(" ");
  const url = rest.join(" ");
  const result = await page.evaluate(
    async ({ method, url }) => {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include" });
      const text = await r.text();
      return { status: r.status, body: text };
    },
    { method, url }
  );
  console.log(JSON.stringify(result, null, 1));
} else if (action === "goto") {
  await page.goto(`http://localhost:5173${arg}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  console.log(`navigated to ${arg}, title: ${await page.title()}`);
} else if (action === "click-text") {
  const el = page.getByText(arg, { exact: false }).first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.click({ timeout: 5000 });
  console.log(`clicked text: ${arg}`);
} else if (action === "frames-detail") {
  const frames = page.frames();
  for (const f of frames) {
    console.log(`--- frame: ${f.url()} ---`);
    const buttons = await f.locator("button").allTextContents().catch(() => []);
    console.log(JSON.stringify(buttons));
  }
}

// Deliberately do NOT call browser.close() here — for connectOverCDP that can tear down the
// remote Chrome process itself in some Playwright versions, and this browser is shared across
// multiple poll invocations across many separate script runs. Just let the process exit; the CDP
// socket drops on its own without touching the remote browser.
process.exit(0);
