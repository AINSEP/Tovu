import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Visual regression (pixel-diff) — admin assistant composer type-ahead ("/") menu.
 *
 * Reference implementation for the VRT paradigm documented in
 * `ADS-memory/reports/2026-08-21-visual-regression-testing-paradigm.md`. Generalizes
 * `theme-visual.spec.ts`'s pattern (fresh hermetic boot, `emulateMedia({ reducedMotion: "reduce" })`,
 * `toHaveScreenshot`, pinned `maxDiffPixelRatio`) from the public theme to the admin app, and targets
 * the owner's own named example: typing `/` in the composer and getting a mangled menu.
 *
 * This is deliberately a SECOND, complementary layer next to
 * `admin-composer-discovery-menu-overlap.spec.ts`'s bounding-box assertions, not a replacement —
 * that spec proves the menu doesn't overlap the textarea; a pixel diff is what catches a menu that
 * doesn't overlap anything but still renders broken (dropped font, missing icon, collapsed padding,
 * wrong colors).
 *
 * Screenshot scope: element-scoped to `.admin-chat-dock` (the composer's own container), NOT
 * `fullPage`. `theme-visual.spec.ts` uses `fullPage: true` because the public theme page has nothing
 * else moving on it. The admin shell does — this suite's own dispatch brief notes an open SSE feed on
 * admin pages that makes `waitUntil: "networkidle"` never resolve, and the sidebar/header render
 * live workspace chrome outside the dock entirely. Scoping the screenshot to the dock element keeps
 * this suite's diff surface limited to the thing under test and immune to chrome elsewhere on the
 * page that has nothing to do with the composer.
 */
async function prepareForScreenshot(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
}

async function openDock(page: Page) {
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await prepareForScreenshot(page);

  await page.locator("button.chat-fab").click();
  const dock = page.locator(".admin-chat-dock");
  await expect(dock).not.toHaveAttribute("hidden", "");
  return dock;
}

test.describe("admin composer type-ahead menu visual regression", () => {
  test("composer dock — resting state (baseline for comparison against the open menu)", async ({ page }) => {
    const dock = await openDock(page);
    const textarea = page.locator("textarea.jini-composer-input");
    await textarea.waitFor({ state: "visible" });

    await expect(dock).toHaveScreenshot("composer-dock-resting.png", { animations: "disabled" });
  });

  test("typing / opens the slash menu — the owner's named bug case", async ({ page }) => {
    const dock = await openDock(page);

    const textarea = page.locator("textarea.jini-composer-input");
    await textarea.click();
    await textarea.pressSequentially("/");

    const palette = page.locator("#jini-composer-slash-menu");
    await expect(palette).toBeVisible();

    await expect(dock).toHaveScreenshot("composer-dock-slash-menu-open.png", { animations: "disabled" });
  });

  test("+ Add Context menu — second type-ahead-style popover, same guard", async ({ page }) => {
    const dock = await openDock(page);

    await page.locator('button[aria-label="Add context"]').click();
    const menu = page.locator(".jini-composer-discovery-menu");
    await expect(menu).toBeVisible();

    await expect(dock).toHaveScreenshot("composer-dock-discovery-menu-open.png", { animations: "disabled" });
  });
});
