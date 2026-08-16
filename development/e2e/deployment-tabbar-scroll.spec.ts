import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Regression test for `.tab-bar`'s narrow-viewport overflow bug, found live (owner UI/UX
 * pass on the Deployment panel, 2026-08-15): `.tab-bar` (`components/TabBar.tsx`,
 * `styles.css` ~L1881) is `display: flex` with no wrap and no overflow handling. At 390px — this
 * project's own documented canary width (`.table-scroll`'s comment, `styles.css`) — Deployment's
 * five tabs (Overview/Static Site/Full Site/Dockerfile/History) are wider than the viewport, and
 * with the default `overflow-x: visible` an ancestor still clips the excess (confirmed live:
 * `document.body.scrollWidth` stays exactly 390px, so this is not page-level horizontal scroll
 * escaping anywhere reachable) — "History" is simply unreachable, not just hard to see.
 *
 * `TabBar.tsx` is also used by `Themes.tsx` (Declarative/Static/Templated/Code/Marketplace) and
 * `Pages.tsx` (My Pages/Theme Pages) — confirmed live that Themes' own tab row independently hits
 * the same overflow at 390px (Pages' two short tabs never fill the row, so it never surfaces
 * there). The fix is in the shared `.tab-bar` rule, not a Deployment-only workaround, so this spec
 * pins the fix on BOTH real screens that were confirmed to actually overflow, not just the one
 * that prompted the fix.
 *
 * No `waitForLoadState("networkidle")` anywhere here — confirmed live (project memory) that it
 * never resolves against this admin app. Every wait is an explicit element/state wait instead.
 *
 * 2026-08-16: a SECOND overflow trigger on the same element, found live (owner screenshot) — the
 * `overflow-x: auto` fix above stopped the clip but only traded it for an invisible scrollbar
 * (macOS overlay scrollbars are hidden until actively scrolled), so at a normal DESKTOP viewport
 * with the admin chat pane docked open (`.admin-chat-dock`, `App.tsx`), the narrowed content
 * column reproduces the same "History is unreachable" symptom without ever touching a narrow
 * phone viewport. `.tab-bar` is now `flex-wrap: wrap` instead of `overflow-x: auto` (`styles.css`
 * ~L1921) — no scrollbar to hide, extra tabs just drop to a second line. The "Deployment: tab row
 * stays fully visible with the chat pane open" test below pins this second trigger; the three
 * tests above still pin the original 390px case under the new fix.
 */

const NARROW_VIEWPORT = { width: 390, height: 844 } as const;

/** Scrolls a `.tab-bar` element to its own max scroll position — the same action a user makes by
 *  dragging/swiping the row, done programmatically since Playwright has no native "swipe" input
 *  for a plain scroll container. A no-op on an element that isn't actually scrollable (pre-fix:
 *  `overflow-x: visible` never updates `scrollLeft`), which is exactly the behavior this test
 *  needs to be able to observe as a failure. */
async function scrollTabBarToEnd(page: Page): Promise<void> {
  await page.locator(".tab-bar").first().evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
}

/** True once `tab`'s bounding box sits fully inside the current viewport's horizontal extent —
 *  the real, user-facing definition of "reachable": present in the DOM is not enough if an
 *  ancestor clips it off-screen with no way to scroll it into view. */
async function isFullyOnscreenHorizontally(page: Page, tab: ReturnType<Page["getByRole"]>): Promise<boolean> {
  const box = await tab.boundingBox();
  if (!box) return false;
  const viewport = page.viewportSize();
  if (!viewport) return false;
  return box.x >= 0 && box.x + box.width <= viewport.width;
}

/** Container-relative version of `isFullyOnscreenHorizontally`, needed once `.tab-bar` no longer
 *  spans nearly the full page viewport — which is the case once the chat dock is open at a normal
 *  desktop width (the dock eats ~380px on the right, so the content column, and `.tab-bar` inside
 *  it, is far narrower than `page.viewportSize()`). Checking a tab's bounding box against the full
 *  page viewport in that layout is a false positive: `boundingBox()` reports `getBoundingClientRect()`,
 *  which is unaffected by an ancestor's `overflow: hidden`/`auto` clipping — a tab sitting well past
 *  `.tab-bar`'s own right edge (clipped, unreachable without scrolling) can still measure as "inside
 *  the 1280px page" and pass a page-viewport check that was never meant for this layout. This helper
 *  checks against `.tab-bar`'s OWN rendered box instead, which is what the CSS `overflow`/`clip`
 *  actually clips against. */
async function isFullyWithinTabBarContainer(page: Page, tab: ReturnType<Page["getByRole"]>): Promise<boolean> {
  const containerBox = await page.locator(".tab-bar").first().boundingBox();
  const box = await tab.boundingBox();
  if (!containerBox || !box) return false;
  const EPS = 1; // sub-pixel layout rounding tolerance
  return (
    box.x >= containerBox.x - EPS &&
    box.x + box.width <= containerBox.x + containerBox.width + EPS &&
    box.y >= containerBox.y - EPS &&
    box.y + box.height <= containerBox.y + containerBox.height + EPS
  );
}

test.describe(".tab-bar stays reachable at a 390px viewport (narrow-width regression)", () => {
  test("Deployment: the last tab (History) is reachable and clicking it navigates there", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(NARROW_VIEWPORT);
    await page.goto("/admin/deployment", { waitUntil: "domcontentloaded" });
    await page.locator(".tab-bar").first().waitFor({ state: "visible", timeout: 10_000 });

    const tabs = await page.getByRole("tab").allTextContents();
    expect(tabs).toEqual(["Overview", "Static Site", "Full Site", "Dockerfile", "History"]);

    await scrollTabBarToEnd(page);
    const historyTab = page.getByRole("tab", { name: "History" });
    await expect(historyTab).toBeVisible();
    expect(await isFullyOnscreenHorizontally(page, historyTab)).toBe(true);

    await historyTab.click();
    await expect(page).toHaveURL(/\?tab=history/);
    await expect(historyTab).toHaveAttribute("aria-selected", "true");
  });

  test("Themes: the last tab (Code) is reachable and clicking it activates it — confirms the shared fix doesn't regress this other TabBar consumer", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(NARROW_VIEWPORT);
    await page.goto("/admin/themes", { waitUntil: "domcontentloaded" });
    await page.locator(".tab-bar").first().waitFor({ state: "visible", timeout: 10_000 });

    await scrollTabBarToEnd(page);
    const codeTab = page.getByRole("tab", { name: /^Code/ });
    await expect(codeTab).toBeVisible();
    expect(await isFullyOnscreenHorizontally(page, codeTab)).toBe(true);

    await codeTab.click();
    await expect(codeTab).toHaveAttribute("aria-selected", "true");
  });

  test("Pages: unaffected at 390px — its two tabs never overflowed, so the fix must not change their layout", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(NARROW_VIEWPORT);
    await page.goto("/admin/pages", { waitUntil: "domcontentloaded" });
    await page.locator(".tab-bar").first().waitFor({ state: "visible", timeout: 10_000 });

    const bar = page.locator(".tab-bar").first();
    const metrics = await bar.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    // Confirms the premise of this test's own name — if Pages' tabs ever grow to overflow, this
    // assertion (not a silent pass) is what should catch it.
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  });
});

test.describe("Deployment: tab row stays fully visible with the admin chat pane open (2026-08-16 regression)", () => {
  test("all five tabs, including History, are reachable without scrolling once the dock narrows the content column", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    // Real desktop width, not the 390px canary above — same viewport `admin-fab-position.spec.ts`
    // uses for its own docked-chat assertions, since this bug only exists once the dock is open at
    // a normal desktop width, not at any viewport width on its own.
    await page.setViewportSize({ width: 800, height: 768 });
    await page.goto("/admin/deployment", { waitUntil: "domcontentloaded" });
    await page.locator(".tab-bar").first().waitFor({ state: "visible", timeout: 10_000 });

    await page.locator("button.chat-fab").click();
    const dock = page.locator(".admin-chat-dock");
    await expect(dock).not.toHaveAttribute("hidden", "");
    // Same settle `admin-fab-position.spec.ts` uses: lets the dock's `ResizeObserver`-driven width
    // measurement (and the resulting content-column reflow) finish before measuring tab positions.
    await page.waitForTimeout(500);

    const tabs = await page.getByRole("tab").allTextContents();
    expect(tabs).toEqual(["Overview", "Static Site", "Full Site", "Dockerfile", "History"]);

    // Deliberately no `scrollTabBarToEnd` call here — the whole point of the reported bug is that
    // a user does not know (and, on macOS, cannot easily tell) there is anything to scroll. If
    // reaching History still requires a manual scroll, the bug is not actually fixed for the person
    // who reported it. `isFullyWithinTabBarContainer`, not `isFullyOnscreenHorizontally`: the page
    // viewport (800px) is much wider than `.tab-bar`'s own content column once the dock is open, so
    // a page-viewport check would pass even while `.tab-bar` itself clips the tab — see that
    // helper's own comment.
    const historyTab = page.getByRole("tab", { name: "History" });
    await expect(historyTab).toBeVisible();
    expect(await isFullyWithinTabBarContainer(page, historyTab)).toBe(true);

    await historyTab.click();
    await expect(page).toHaveURL(/\?tab=history/);
    await expect(historyTab).toHaveAttribute("aria-selected", "true");
  });
});
