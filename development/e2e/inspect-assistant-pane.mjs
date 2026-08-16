/**
 * @file Reopens the admin, opens the assistant dock, and reports what the operator can actually
 * SEE in the chat pane — scroll position, whether the last assistant message is inside the
 * viewport, and whether an MCP-UI surface iframe is still occupying the pane.
 *
 * Written because a real publish failed with a full, correct assistant explanation present in the
 * DOM, and the operator reported seeing no response at all. "It rendered" and "a human saw it" are
 * different claims; this file measures the second one.
 *
 * The conversation persists across dock close and re-login (ADR-049: the dock is `hidden`, never
 * unmounted, and the conversation is server-side), so a fresh session shows the same transcript.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.TOVU_ADMIN_URL ?? "http://localhost:5173";

const browser = await chromium.launch({
  headless: false,
  slowMo: 120,
  args: ["--window-size=1680,1050", "--window-position=40,40"],
});
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage();

await page.goto(`${BASE}/admin/`, { waitUntil: "domcontentloaded" });
await page.locator(".login-card").waitFor({ state: "visible", timeout: 20_000 });
await page.getByLabel("Username").fill(process.env.TOVU_ADMIN_USER ?? "admin");
await page.getByLabel("Password").fill(process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev");
await page.getByRole("button", { name: /sign in/i }).click();
await page.locator(".admin-layout").waitFor({ state: "visible", timeout: 20_000 });

await page.locator(".chat-fab").click();
await page.locator(".admin-chat-dock.is-open").waitFor({ state: "visible", timeout: 15_000 });
await page.waitForTimeout(3000);

// A new browser session starts a FRESH conversation — the prior transcript is reachable only
// through the pane's own Conversations list. Measured 2026-08-16: without this step the pane is
// empty and every "was it visible" question answers itself misleadingly.
await page.locator("button.jini-conv-trigger").click();
await page.waitForTimeout(1500);
const convItems = page.locator(".admin-chat-dock [role=menuitem], .admin-chat-dock [role=option], .admin-chat-dock li button");
const convCount = await convItems.count();
console.log(`conversations listed: ${convCount}`);
for (let i = 0; i < Math.min(convCount, 6); i += 1) {
  console.log(`  [${i}] ${((await convItems.nth(i).textContent()) ?? "").trim().slice(0, 70)}`);
}
if (convCount > 0) {
  await convItems.first().click();
  await page.waitForTimeout(4000);
}

const report = await page.evaluate(() => {
  const dock = document.querySelector(".admin-chat-dock");
  if (!dock) return { error: "no dock" };

  // Find the actual scrolling element inside the pane.
  const scrollers = [...dock.querySelectorAll("*")]
    .filter((el) => el.scrollHeight > el.clientHeight + 4 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY))
    .map((el) => ({
      cls: el.getAttribute("class"),
      scrollTop: Math.round(el.scrollTop),
      scrollHeight: Math.round(el.scrollHeight),
      clientHeight: Math.round(el.clientHeight),
      atBottom: Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 8,
      hiddenBelow: Math.round(el.scrollHeight - el.clientHeight - el.scrollTop),
    }));

  const iframes = [...dock.querySelectorAll("iframe")].map((f) => {
    const r = f.getBoundingClientRect();
    return { title: f.getAttribute("title"), h: Math.round(r.height), top: Math.round(r.top), inView: r.bottom > 0 && r.top < innerHeight };
  });

  // Locate the final assistant prose block and ask whether any of it is on screen.
  const blocks = [...dock.querySelectorAll("p, li, div")].filter((el) => (el.textContent || "").includes("Bad credentials"));
  const target = blocks.length ? blocks[blocks.length - 1] : null;
  let lastMsg = null;
  if (target) {
    const r = target.getBoundingClientRect();
    lastMsg = {
      text: (target.textContent || "").trim().slice(0, 90),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      inViewport: r.bottom > 0 && r.top < innerHeight,
    };
  }

  return { scrollers, iframes, lastMsg, foundFailureText: blocks.length > 0 };
});

console.log(JSON.stringify(report, null, 1));
await page.screenshot({ path: "development/e2e/.artifacts/pane-after-failure.png" });
console.log("screenshot: development/e2e/.artifacts/pane-after-failure.png");
await page.waitForTimeout(900_000);
await browser.close();
