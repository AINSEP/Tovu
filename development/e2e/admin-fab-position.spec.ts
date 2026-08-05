import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Bug 5 — the desktop chat-FAB/composer-send-button overlap, browser-verified 2026-08-05.
 *
 * `button.chat-fab.chat-fab-dock-open` used to sit on top of the docked assistant panel's own send
 * button at desktop widths and swallow its clicks — `apps/admin/src/hooks/use-fab-position.hooks.ts`'s
 * `useFabPosition` only carried the OLD `.chat-fab-dock-open { right: calc(380px + 20px) }` rule's
 * vertical axis (`avoidBottomPx`) forward when it replaced that CSS rule, not its horizontal one; a
 * confidently-worded comment on the same code claimed `avoidBottomPx` "generalizes" the old rule,
 * which was wrong — different axis — and desktop always passes `avoidBottomPx: 0`, so nothing
 * displaced the FAB at all. Fixed by measuring the dock's real rendered width via `ResizeObserver`
 * (`apps/admin/src/App.tsx`'s `dockWidthPx`) and passing it through as `avoidRightPx`.
 *
 * Promoted here from a one-off throwaway verification script per this project's standing rule that
 * browser tests get saved and rerunnable, not left in scratch (see
 * `ADS-memory/reports/analysis/2026-08-05-bug5-fab-browser-verification.md` for the original probe's
 * full evidence trail, including why no existing spec — `destructive-path.spec.ts` submits via
 * `Enter`, never a real click on the send button — could catch this).
 *
 * No `waitForLoadState("networkidle")` anywhere in this file: confirmed live (project memory) that it
 * never resolves against this admin app. Every wait below is an explicit element/state wait instead.
 */

const SEND_BUTTON_SELECTOR = "button.jini-composer-send";

test.describe("admin chat FAB does not intercept the composer's send button (Bug 5)", () => {
  test("at desktop width, with the dock open, the send button is fully clickable and unobstructed", async ({ page }) => {
    await loginAsAdmin(page);

    // Real desktop width — well above `App.tsx`'s `isSheetMode` breakpoint (`max-width: 640px`),
    // so this exercises the DOCKED path (`avoidRightPx`), not the mobile sheet (`avoidBottomPx`).
    // This is also `playwright.admin-fab.config.ts`'s own configured viewport; set again explicitly
    // here so the assumption is visible at the point that depends on it, not only in the config.
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.locator("button.chat-fab").click();
    const dock = page.locator(".admin-chat-dock");
    await expect(dock).not.toHaveAttribute("hidden", "");

    // Lets the `ResizeObserver`-driven `dockWidthPx` measurement (`App.tsx`) settle into
    // `useFabPosition`'s `avoidRightPx` — there is no single DOM event to wait on for "the FAB has
    // finished repositioning after a resize observation," so a short explicit wait is used instead
    // of polling internal React state. Not a `networkidle` substitute: this waits on a known,
    // bounded, one-shot layout settle, not on network activity that this app's own dev tooling
    // (Vite HMR websocket, etc.) can keep alive indefinitely.
    await page.waitForTimeout(500);

    const fab = page.locator("button.chat-fab.chat-fab-dock-open");
    await expect(fab).toBeVisible();
    const sendButton = page.locator(SEND_BUTTON_SELECTOR);
    await expect(sendButton).toBeVisible();

    const fabBox = await fab.boundingBox();
    const sendBox = await sendButton.boundingBox();
    expect(fabBox, "FAB bounding box must be measurable").not.toBeNull();
    expect(sendBox, "send button bounding box must be measurable").not.toBeNull();

    // --- Check 1: no rectangle overlap between the FAB and the send button. ---
    // Standard axis-aligned-bounding-box separation test: two boxes overlap only if they overlap on
    // BOTH axes, so non-overlap on either axis alone is sufficient proof of no collision.
    const noOverlap =
      fabBox.x + fabBox.width <= sendBox.x ||
      sendBox.x + sendBox.width <= fabBox.x ||
      fabBox.y + fabBox.height <= sendBox.y ||
      sendBox.y + sendBox.height <= fabBox.y;
    expect(noOverlap, `FAB box ${JSON.stringify(fabBox)} must not overlap send button box ${JSON.stringify(sendBox)}`).toBe(true);

    // --- Check 2: the send button's own visual center resolves to the send button, not the FAB. ---
    // `.closest()`, not an exact class match: the button renders a `RemixIcon` `<i>` as its topmost
    // child, so `elementFromPoint` at the visual center returns that icon, a descendant, not the
    // `<button>` element itself. The real question is whether the resolved node is the send button
    // OR nested inside it (true here) versus the FAB or one of ITS OWN children (would be true if
    // this bug had regressed).
    const centerCheck = await page.evaluate(
      ({ x, y, selector }) => {
        const el = document.elementFromPoint(x, y);
        return {
          matchesSend: el?.closest(selector) !== null,
          isFabOrChild: el?.closest(".chat-fab") !== null,
        };
      },
      { x: sendBox.x + sendBox.width / 2, y: sendBox.y + sendBox.height / 2, selector: SEND_BUTTON_SELECTOR }
    );
    expect(centerCheck.matchesSend, "the send button's own center pixel must resolve inside the send button").toBe(true);
    expect(centerCheck.isFabOrChild, "the send button's own center pixel must NOT resolve inside the FAB").toBe(false);

    // --- Check 3: a real click reaches the send button. ---
    // This is the bug's own original failure signature (`use-fab-position.hooks.ts`'s own doc
    // comment: Playwright caught it as `<button class="chat-fab chat-fab-dock-open"> intercepts
    // pointer events` while trying to send a message) — a direct, not indirect, regression check.
    // Playwright's `.click()` auto-waits on actionability (visible, stable, unobstructed, receives
    // events) and fails the test outright with that same "intercepts pointer events" error if
    // something is on top, so no manual try/catch is needed here: an interception IS a test failure.
    const composer = page.locator("textarea.jini-composer-input");
    await composer.fill("Bug 5 regression check — not actually sent to any provider");
    await sendButton.click({ timeout: 8_000 });
  });
});
