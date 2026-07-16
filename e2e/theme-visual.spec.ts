import { test, expect, type Page } from "@playwright/test";

/**
 * @file Visual regression testing (VRT) — todos.md AW-2.
 *
 * Renders the live `tovu-official` theme (via the `webServer` in `playwright.config.ts`, a fresh
 * `TOVU_DB=memory` boot per run) at the viewports/routes that matter and diffs against the
 * checked-in baselines under `e2e/theme-visual.spec.ts-snapshots/`.
 *
 * This suite exists to eventually guard two known, currently-unfixed bugs (see todos.md AW-1 and
 * AW-4) — but it does NOT baseline either bug's broken state:
 *   - AW-1 (mobile nav drawer clipping): the mobile screenshot below only covers the drawer
 *     CLOSED state. The open-drawer state is where the clipping bug lives; baselining it now
 *     would freeze the bug into the "approved" snapshot. Add an open-drawer screenshot once AW-1
 *     is fixed.
 *   - AW-4 (wide-screen entry/content-page layout): out of scope for this suite's first cut
 *     (todos.md's AW-2 plan only calls for a home + post-page baseline). The home-wide screenshot
 *     here covers the home page's full-bleed band rhythm at 2560px, which is already correct —
 *     it does not cover `/about`-style entry pages, where the AW-4 bug actually lives.
 */

// Anti-flake: reuses the theme's own baked-in
// `@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }`
// (see src/server/http/site/render.ts BASE_STYLE) instead of injecting ad hoc CSS.
async function prepareForScreenshot(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
}

// Anti-flake: wait for webfonts (Google Fonts, loaded per theme.json `fonts`) to finish loading
// before screenshotting, so text doesn't shift from a fallback font to the real one mid-diff.
// Bounded wait — a slow/unavailable font CDN must not hang the suite, just risk a font-swap diff.
async function waitForFonts(page: Page): Promise<void> {
  await page
    .waitForFunction(() => document.fonts.status === "loaded", undefined, { timeout: 5_000 })
    .catch(() => {
      /* best-effort — screenshot proceeds even if webfonts haven't settled */
    });
}

test.describe("theme visual regression (AW-2)", () => {
  test("home — desktop 1280", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareForScreenshot(page);
    await page.goto("/");
    await waitForFonts(page);
    await expect(page).toHaveScreenshot("home-desktop.png", { fullPage: true });
  });

  test("home — wide 2560 (guards the full-bleed band rhythm)", async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1000 });
    await prepareForScreenshot(page);
    await page.goto("/");
    await waitForFonts(page);
    await expect(page).toHaveScreenshot("home-wide.png", { fullPage: true });
  });

  test("home — mobile 390, drawer CLOSED (AW-1 bug lives in the open state — not baselined here)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareForScreenshot(page);
    await page.goto("/");
    await waitForFonts(page);
    // Deliberately do NOT click `label.nav-burger` here. Baseline the open-drawer state only
    // after AW-1's clipping fix lands.
    //
    // Separate, newly-observed quirk (NOT AW-1, not fixed here — test infra only): the *closed*
    // drawer is `position: fixed; transform: translateX(110%)`, which still contributes to
    // `document.documentElement.scrollWidth` at mobile widths (confirmed: scrollWidth 742 vs
    // clientWidth 390 on this page). An unclipped `fullPage` screenshot would capture that
    // off-canvas bleed and bake it into the "closed drawer" baseline, which is not the intended
    // state. Clip to the true viewport width so the baseline reflects what a mobile visitor
    // actually sees.
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    await expect(page).toHaveScreenshot("home-mobile-390.png", {
      fullPage: true,
      clip: { x: 0, y: 0, width: 390, height: scrollHeight },
    });
  });

  test("post page — /welcome", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareForScreenshot(page);
    await page.goto("/welcome");
    await waitForFonts(page);
    await expect(page).toHaveScreenshot("post-welcome.png", { fullPage: true });
  });
});
