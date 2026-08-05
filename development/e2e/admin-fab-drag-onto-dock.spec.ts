import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Regression check for a same-day-introduced bug: dragging the desktop chat FAB onto the
 * open assistant dock used to rest normally DURING the drag, then snap back out onto the page the
 * moment it was released. Reported by the operator as "I can't drag it onto the chat pane —
 * whenever I do, it just resets outside of the chat pane onto the regular page."
 *
 * Root cause, confirmed by reading (`apps/admin/src/hooks/use-fab-position.hooks.ts`): the
 * `26b70a9` commit wired `avoidRightPx` (the measured desktop dock width) into `useFabPosition` to
 * fix a real, previously-Playwright-caught bug — the FAB's DEFAULT resting spot sat on top of the
 * dock's own composer send button (`admin-fab-position.spec.ts`, "Bug 5"). But the fix gated
 * purely on `dockOpen`, with no distinction between an untouched default position and a position
 * the operator had just deliberately dragged there — so on `pointerup`, the resting-style
 * recompute unconditionally pushed ANY drop inside the dock's width back out to
 * `avoidRightPx + FAB_EDGE_MARGIN`, regardless of how far from the composer button the drop
 * actually landed.
 *
 * Fixed by adding `pinnedByUser` to the persisted position: `true` only for an actual
 * drag-and-drop, gating the dock-avoidance clamp on `!pinnedByUser` so a deliberate drop is
 * respected while the untouched default spot (and any pre-existing/migrated-legacy position,
 * conservatively) still avoids the composer button. See that field's own doc on
 * `StoredFabPosition` for the full reasoning.
 *
 * Complements `admin-fab-position.spec.ts` rather than replacing it: that spec pins "the default
 * spot must avoid the composer button"; this one pins "an explicit drop elsewhere in the dock must
 * NOT be vetoed" — the two are opposite-direction regressions of the same clamp and both need
 * their own coverage, or a fix for one can silently reintroduce the other.
 *
 * No `waitForLoadState("networkidle")` anywhere in this file — confirmed live (project memory) that
 * it never resolves against this admin app. Every wait below is an explicit element/state wait, or
 * (for the `ResizeObserver`-driven dock-width measurement, which has no single settle event to
 * poll) the same short bounded timeout `admin-fab-position.spec.ts` already established for that
 * exact measurement.
 */

const STORAGE_KEY = "tovu-admin-fab-position";

test.describe("admin chat FAB can be dropped onto the open dock and stays there", () => {
  test("a drop well clear of the composer send button rests inside the dock, not pushed back onto the page", async ({ page }) => {
    await loginAsAdmin(page);

    // Real desktop width — same viewport `admin-fab-position.spec.ts` and this config use, so this
    // exercises the DOCKED path (`avoidRightPx`), not the mobile sheet (`avoidBottomPx`).
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.locator("button.chat-fab").click();
    const dock = page.locator(".admin-chat-dock");
    await expect(dock).not.toHaveAttribute("hidden", "");

    // Same settle as `admin-fab-position.spec.ts`: lets the `ResizeObserver`-driven `dockWidthPx`
    // measurement land in `useFabPosition`'s `avoidRightPx` before the drag starts, so the drag's
    // start position reflects the FAB already having been pushed clear of the dock (the untouched
    // default's expected, unregressed behavior — see that spec for the dedicated check).
    await page.waitForTimeout(500);

    const fab = page.locator("button.chat-fab.chat-fab-dock-open");
    await expect(fab).toBeVisible();
    const dockBoxBefore = await dock.boundingBox();
    const fabBoxBefore = await fab.boundingBox();
    expect(dockBoxBefore, "dock bounding box must be measurable").not.toBeNull();
    expect(fabBoxBefore, "FAB bounding box must be measurable before the drag").not.toBeNull();
    if (!dockBoxBefore || !fabBoxBefore) throw new Error("unreachable — asserted above");

    // Sanity check on the starting assumption this test depends on: before the drag, the FAB must
    // already be OUTSIDE the dock's horizontal band (the avoidance clamp doing its job for the
    // untouched default spot). If this ever fails, the drag below would prove nothing either way.
    expect(fabBoxBefore.x + fabBoxBefore.width, "FAB must start left of the dock before the drag").toBeLessThanOrEqual(dockBoxBefore.x);

    // Drop target: well inside the dock horizontally, and near its TOP (below the header, clear of
    // the composer's send button which sits at the dock's bottom) — the drop this bug affected was
    // never actually near the send button; the old clamp rejected ANY position inside the dock's
    // width, at any height, which is exactly what this point is chosen to demonstrate.
    const targetX = dockBoxBefore.x + dockBoxBefore.width / 2;
    const targetY = dockBoxBefore.y + 90;

    const fabCenterX = fabBoxBefore.x + fabBoxBefore.width / 2;
    const fabCenterY = fabBoxBefore.y + fabBoxBefore.height / 2;

    await page.mouse.move(fabCenterX, fabCenterY);
    await page.mouse.down();
    // Multiple intermediate steps: `useFabPosition`'s own `DRAG_THRESHOLD_PX` (5px of net pointer
    // movement) has to be crossed via real `pointermove` events, not a single teleporting jump, to
    // match how a real drag gesture is recognized.
    await page.mouse.move((fabCenterX + targetX) / 2, (fabCenterY + targetY) / 2, { steps: 10 });
    await page.mouse.move(targetX, targetY, { steps: 10 });
    await page.mouse.up();

    // The FAB's own resting-position recompute happens synchronously in React state, but give one
    // frame for the DOM to reflect it rather than reading `boundingBox()` in the same tick as `up()`.
    await page.waitForTimeout(100);

    const fabBoxAfter = await fab.boundingBox();
    expect(fabBoxAfter, "FAB bounding box must be measurable after the drop").not.toBeNull();
    if (!fabBoxAfter) throw new Error("unreachable — asserted above");

    // The regression's own failure signature: before the fix, this would equal `fabBoxBefore` (or
    // any other position left of the dock) — the drop snapping straight back out. After the fix,
    // the FAB's horizontal center must land inside the dock's horizontal span.
    const fabCenterXAfter = fabBoxAfter.x + fabBoxAfter.width / 2;
    expect(
      fabCenterXAfter,
      `FAB center (${fabCenterXAfter}) must land inside the dock's horizontal span [${dockBoxBefore.x}, ${dockBoxBefore.x + dockBoxBefore.width}] after being dropped there`
    ).toBeGreaterThanOrEqual(dockBoxBefore.x);

    // Direct mechanism check, not just the visible symptom: the persisted position must actually be
    // marked `pinnedByUser`, confirming the fix's own gate (not some unrelated coincidence of pixel
    // math) is what let the drop stick.
    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored, "a completed drag must persist a position").not.toBeNull();
    const parsed = JSON.parse(stored ?? "{}") as { pinnedByUser?: boolean };
    expect(parsed.pinnedByUser, "a completed drag-and-drop must be marked pinnedByUser").toBe(true);

    // Closing and reopening the dock must not un-pin the drop — the avoidance clamp is gated on
    // `!pinnedByUser`, not on some one-render-only flag, so this has to survive a real toggle.
    await page.locator("button.chat-fab.chat-fab-dock-open").click(); // close
    await expect(dock).toHaveAttribute("hidden", "");
    await page.locator("button.chat-fab").click(); // reopen
    await expect(dock).not.toHaveAttribute("hidden", "");
    await page.waitForTimeout(500);

    const fabBoxReopened = await page.locator("button.chat-fab.chat-fab-dock-open").boundingBox();
    expect(fabBoxReopened, "FAB bounding box must be measurable after reopening the dock").not.toBeNull();
    if (!fabBoxReopened) throw new Error("unreachable — asserted above");
    const fabCenterXReopened = fabBoxReopened.x + fabBoxReopened.width / 2;
    expect(
      fabCenterXReopened,
      "the pinned position must still be inside the dock after a close/reopen cycle"
    ).toBeGreaterThanOrEqual(dockBoxBefore.x);
  });
});
