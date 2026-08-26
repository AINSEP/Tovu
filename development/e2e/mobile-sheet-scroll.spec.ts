import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Regression test for the mobile chat sheet blocking scroll to the bottom of the page
 * (owner repro, 2026-08-26): *"the bottom sheet AI agent wasn't allowing me to scroll... there's
 * CSS at the bottom that adjusts for when it's mobile size and when the agent chat appears."*
 *
 * The page underneath was never scroll-locked — `.admin-content` keeps its own `overflow-y: auto`.
 * The real bug: nothing was reserved below the last element, so it could never be scrolled clear
 * of the sheet (`.admin-chat-dock`, `styles.css`'s `max-width: 640px` block), which sits
 * `position: fixed` over the bottom 58vh (peek) or 92vh (expanded) of the viewport.
 *
 * The first fix reserved that space with `padding-bottom` on `.admin-content`. That broke at a
 * short viewport in the expanded state: padding can never shrink a box below its own value
 * (border-box's floor), so `padding-bottom: 92vh` plus the existing padding-top forced
 * `.admin-content` taller than its flex-allotted height, pushing its true bottom edge below the
 * viewport and leaving the last row still ~14px under the sheet even at max scroll. The fix is an
 * `::after` spacer instead — ordinary scrollable content, which `overflow-y: auto` clips like
 * anything else, so the box never grows past its flex-determined size. `375x667` + expanded is the
 * viewport/state pair that exposed this; it is asserted explicitly below, not just the roomier
 * `414x896` the owner's own repro used.
 *
 * jsdom has no layout engine (no real flexbox/box-model math), so none of this is unit-testable —
 * confirmed live via `content.style.paddingBottom = ...` experiments that only a real browser
 * could run.
 */

/** Not a fixed literal: the hermetic `TOVU_DB=memory` server this config boots seeds fewer posts
 *  than a real dev-database, so the count is read back rather than assumed. Each test still
 *  confirms it got more than one row — enough to actually scroll, which is the whole premise. */
async function expectScrollablePostsList(page: Page): Promise<void> {
  await page.locator(".list-table tbody tr").first().waitFor({ state: "visible", timeout: 10_000 });
  const count = await page.locator(".list-table tbody tr").count();
  expect(count, "seed data must have more than one post to make a scrollable list").toBeGreaterThan(1);
}

async function openSheet(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open assistant" }).click();
  await expect(page.locator(".admin-chat-dock")).not.toHaveAttribute("hidden", "");
}

async function expandSheet(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Expand assistant panel" }).click();
  await expect(page.locator(".admin-chat-dock")).toHaveClass(/is-expanded/);
}

/** Scrolls `.admin-content` to its max and reports whether the last table row's bottom edge
 *  cleared the sheet's top edge — the owner's own bar: "you could just scroll more up the page." */
async function lastRowClearsSheet(page: Page): Promise<{ cleared: boolean; gap: number }> {
  return page.evaluate(() => {
    const content = document.querySelector(".admin-content") as HTMLElement;
    const dock = document.querySelector(".admin-chat-dock") as HTMLElement;
    content.scrollTop = content.scrollHeight;
    const rows = content.querySelectorAll(".list-table tbody tr");
    const lastRow = rows[rows.length - 1] as HTMLElement;
    const gap = dock.getBoundingClientRect().top - lastRow.getBoundingClientRect().bottom;
    return { cleared: gap >= -1, gap }; // 1px tolerance for subpixel rounding
  });
}

test.describe("mobile chat sheet reserves scroll room instead of blocking it", () => {
  test("414x896, peek state: the last row on a long page clears the sheet", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto("/admin/posts", { waitUntil: "domcontentloaded" });
    await expectScrollablePostsList(page);

    await openSheet(page);
    const result = await lastRowClearsSheet(page);
    expect(result.cleared, `last row should clear the sheet, gap was ${result.gap}px`).toBe(true);
  });

  test("414x896, expanded state: the last row still clears the taller sheet", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto("/admin/posts", { waitUntil: "domcontentloaded" });
    await expectScrollablePostsList(page);

    await openSheet(page);
    await expandSheet(page);
    const result = await lastRowClearsSheet(page);
    expect(result.cleared, `last row should clear the sheet, gap was ${result.gap}px`).toBe(true);
  });

  test("375x667, expanded state: the padding-floor regression stays fixed", async ({ page }) => {
    await loginAsAdmin(page);
    // The exact viewport that exposed the padding-bottom box-model bug: 92vh of 667px (613.64px)
    // plus the base 16px padding-top exceeds `.admin-content`'s entire 615px flex-allotted height.
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/admin/posts", { waitUntil: "domcontentloaded" });
    await expectScrollablePostsList(page);

    await openSheet(page);
    await expandSheet(page);

    // Pins the mechanism, not just the symptom: `.admin-content`'s own rendered box must stay at
    // its flex-allotted height (never taller), which is what makes the row-clearance check above
    // meaningful rather than accidental.
    const contentHeight = await page.evaluate(() => document.querySelector(".admin-content")!.getBoundingClientRect().height);
    const viewportHeight = page.viewportSize()!.height;
    const topbarHeight = await page.evaluate(() => document.querySelector(".admin-topbar")!.getBoundingClientRect().height);
    expect(contentHeight).toBeLessThanOrEqual(viewportHeight - topbarHeight + 1);

    const result = await lastRowClearsSheet(page);
    expect(result.cleared, `last row should clear the sheet, gap was ${result.gap}px`).toBe(true);
  });

  test("closing the sheet leaves no reserved dead space to scroll into", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto("/admin/posts", { waitUntil: "domcontentloaded" });
    await expectScrollablePostsList(page);

    const naturalMaxScroll = await page.evaluate(() => {
      const content = document.querySelector(".admin-content") as HTMLElement;
      return content.scrollHeight - content.clientHeight;
    });

    await openSheet(page);
    await expandSheet(page);
    await page.getByRole("button", { name: "Close assistant" }).click();
    await expect(page.locator(".admin-chat-dock")).toHaveAttribute("hidden", "");

    const closedMaxScroll = await page.evaluate(() => {
      const content = document.querySelector(".admin-content") as HTMLElement;
      return content.scrollHeight - content.clientHeight;
    });
    expect(closedMaxScroll).toBe(naturalMaxScroll);
  });
});
