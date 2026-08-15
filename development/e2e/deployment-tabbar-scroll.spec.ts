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
