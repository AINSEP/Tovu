/**
 * @file Measures, with real pixel numbers, whether a publish confirmation surface's action buttons
 * are actually reachable in the operator's viewport — the same question the two live-run reports
 * that started this work answered by hand ("top edge ~y=345, composer starts ~y=770, room=425px for
 * a 559px frame"). This script gets those numbers from the running app instead of a screenshot ruler.
 *
 * SAFETY: reuses `surface-automation-probe.mjs`'s request and always clicks Cancel, never Publish —
 * safe to run repeatedly. Never run `live-publish-driver.mjs`, which performs a real irreversible
 * publish.
 *
 * Usage: node development/e2e/measure-surface-layout.mjs [--label before|after]
 * Writes development/e2e/.artifacts/surface-layout-<label>.png and prints a JSON measurement.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.TOVU_ADMIN_URL ?? "http://localhost:5173";
const label = (process.argv.find((a) => a.startsWith("--label="))?.split("=")[1]) ?? "measurement";
const stamp = () => new Date().toISOString().slice(11, 19);
const log = (m) => console.log(`[${stamp()}] ${m}`);

/** Everything geometric the pane can tell us, in one page.evaluate — mirrors
 * `inspect-assistant-pane.mjs`'s scroller/iframe measurements but generalized (no hardcoded text
 * match) and merged with the surface's OWN action-button geometry via the caller's frameLocator
 * boundingBox() calls, which Playwright already resolves to main-page viewport coordinates. */
async function measurePane(page) {
  return page.evaluate(() => {
    const dock = document.querySelector(".admin-chat-dock");
    if (!dock) return { error: "no dock" };
    const scrollers = [...dock.querySelectorAll("*")]
      .filter((el) => el.scrollHeight > el.clientHeight + 4 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY))
      .map((el) => {
        const hiddenBelow = Math.round(el.scrollHeight - el.clientHeight - el.scrollTop);
        const r = el.getBoundingClientRect();
        return {
          cls: el.getAttribute("class"),
          scrollTop: Math.round(el.scrollTop),
          scrollHeight: Math.round(el.scrollHeight),
          clientHeight: Math.round(el.clientHeight),
          hiddenBelowPx: hiddenBelow,
          atBottom: Math.abs(hiddenBelow) < 8,
          // The container's OWN on-screen box — what a button's rect has to fall INSIDE to be
          // actually visible, as opposed to merely being within the browser window. A button can sit
          // at a window-valid y-coordinate while still being clipped away by this container's own
          // `overflow: auto` boundary (getBoundingClientRect ignores ancestor clipping entirely), or
          // covered by a later sibling like the composer — both are exactly the failure modes that
          // made the operator unable to find Publish/Cancel despite them technically "existing".
          visibleTop: Math.round(r.top),
          visibleBottom: Math.round(r.bottom),
        };
      });
    const iframes = [...dock.querySelectorAll("iframe")].map((f) => {
      const r = f.getBoundingClientRect();
      return {
        title: f.getAttribute("title"),
        styleHeight: f.style.height,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        fullyInViewport: r.top >= 0 && r.bottom <= innerHeight,
      };
    });
    const composer = dock.querySelector(".jini-composer");
    const composerTop = composer ? Math.round(composer.getBoundingClientRect().top) : null;

    // Structural diagnostic: dump box + key computed styles for the whole ancestor chain from the
    // dock down to the composer, so an overlap can be attributed to a specific rule (position,
    // missing flex-shrink, a height that doesn't account for a sibling) instead of guessed at.
    function describe(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        selector: el.className || el.tagName,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        position: cs.position,
        display: cs.display,
        flexDirection: cs.flexDirection,
        flex: cs.flex,
        flexShrink: cs.flexShrink,
        overflowY: cs.overflowY,
        zIndex: cs.zIndex,
        cssHeight: cs.height,
        minHeight: cs.minHeight,
      };
    }
    const chain = {
      dock: describe(dock),
      chatPane: describe(dock.querySelector(".jini-chat-pane")),
      body: describe(dock.querySelector(".jini-chat-pane__body")),
      messageList: describe(dock.querySelector(".jini-message-list")),
      controls: describe(dock.querySelector(".jini-chat-pane__controls")),
      composer: describe(composer),
    };
    return { scrollers, iframes, composerTop, viewportHeight: innerHeight, chain };
  });
}

const browser = await chromium.launch({
  headless: false,
  slowMo: 80,
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
await page.locator("textarea.jini-composer-input").waitFor({ state: "visible", timeout: 15_000 });
log("logged in, chat open");

await page
  .locator("textarea.jini-composer-input")
  .fill(
    "Publish the site to GitHub Pages, owner leonaburime-ucla, repo tovu-demo, project name " +
      `"surface layout measurement ${label}". Go straight to the publish tool.`
  );
await page.locator("button.jini-composer-send").click();
log("request sent; waiting for the confirmation surface");

const frame = page.frameLocator(".admin-chat-dock iframe");
const confirmBtn = frame.locator('[data-mcpui-action="confirm"]');
const cancelBtn = frame.locator('[data-mcpui-action="cancel"]');
await cancelBtn.waitFor({ state: "visible", timeout: 180_000 });
// Let any async ui/notifications/size-changed growth settle before measuring.
await page.waitForTimeout(1500);

const paneGeometry = await measurePane(page);
const confirmBox = await confirmBtn.boundingBox();
const cancelBox = await cancelBtn.boundingBox();
const viewportHeight = page.viewportSize()?.height ?? null;

// The real "can a human see this" check: the button's rect must fall inside BOTH the browser
// window AND its scrolling ancestor's own clipped box (and above the composer, which is a sibling
// outside that scroller, not a clip boundary — an overlap there is a paint-order/coverage bug, not
// a clipping one, so it is checked separately below rather than folded into the same boolean).
const scroller = paneGeometry.scrollers?.[0];
function actuallyVisible(box) {
  if (!box || viewportHeight == null) return null;
  const top = box.y;
  const bottom = box.y + box.height;
  const inWindow = top >= 0 && bottom <= viewportHeight;
  const inScroller = !scroller || (top >= scroller.visibleTop && bottom <= scroller.visibleBottom);
  const coveredByComposer = paneGeometry.composerTop != null && bottom > paneGeometry.composerTop;
  return { inWindow, inScroller, coveredByComposer, actuallyVisible: inWindow && inScroller && !coveredByComposer };
}

const result = {
  label,
  viewportHeight,
  paneGeometry,
  // boundingBox() coordinates are already resolved to the top-level page/viewport, not the iframe's
  // own document.
  confirmButton: confirmBox && { top: Math.round(confirmBox.y), bottom: Math.round(confirmBox.y + confirmBox.height), ...actuallyVisible(confirmBox) },
  cancelButton: cancelBox && { top: Math.round(cancelBox.y), bottom: Math.round(cancelBox.y + cancelBox.height), ...actuallyVisible(cancelBox) },
};
log(`MEASURED: ${JSON.stringify(result, null, 2)}`);

await page.screenshot({ path: `development/e2e/.artifacts/surface-layout-${label}.png` });
log(`screenshot: development/e2e/.artifacts/surface-layout-${label}.png`);

log("clicking Cancel (never Publish) to resolve the parked call cleanly");
await cancelBtn.click();
await page.waitForTimeout(3000);

await browser.close();
console.log("RESULT_JSON:" + JSON.stringify(result));
