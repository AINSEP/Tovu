import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Regression coverage for an owner-reported bug (2026-08-17): "if the preview is small, it
 * hides the sidebar" — a narrow browser window on the theme Explore screen, not a small iframe.
 *
 * Root cause: `.theme-explore-files-wrap` (`styles.css`) is deliberately given no in-flow content of
 * its own — the real file list (`<nav class="theme-explore-files">`) inside it is
 * `position: absolute; inset: 0`, so the wrap contributes nothing to its CSS grid row's auto-height;
 * it relies entirely on the grid's default `align-items: stretch` pulling it up to match
 * `.theme-explore-main`'s (the toolbar + preview pane's) natural height. That only works while both
 * cells share ONE grid row (`.theme-explore`'s desktop 2-column layout). At the `max-width: 720px`
 * breakpoint, `.theme-explore` drops to a single column, so the grid auto-places each cell into its
 * OWN row — the sidebar's row now has no sibling to borrow height from, its own auto-height is 0 (no
 * in-flow content), and the absolutely-positioned `<nav>` filling that box collapses to 0px too. The
 * sidebar is still in the DOM, just invisible.
 *
 * Fix: at that breakpoint, `.theme-explore-files-wrap`/`.theme-explore-files` fall back to normal
 * document flow (`position: static`) with an explicit `max-height` cap instead of relying on the
 * stretch trick that no longer has a sibling to match.
 */

const NARROW_VIEWPORT = { width: 500, height: 844 } as const;

test.describe("theme Explore — sidebar stays visible at a narrow viewport (2026-08-17 regression)", () => {
  test("the file list has non-zero height and its rows are visible below 720px", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(NARROW_VIEWPORT);
    await page.goto("/admin/themes/explore?theme=basic", { waitUntil: "domcontentloaded" });

    const fileList = page.locator(".theme-explore-files").first();
    await fileList.waitFor({ state: "attached", timeout: 10_000 });

    // The bug's real symptom: present in the DOM but rendered at 0px tall, so nothing inside it is
    // reachable. A non-zero bounding-box height is the honest "is it actually visible" check.
    const box = await fileList.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(0);

    const pagesHeading = page.locator(".theme-explore-files-heading", { hasText: "Pages" });
    await expect(pagesHeading).toBeVisible();

    const firstFileRow = page.locator(".theme-explore-file-row").first();
    await expect(firstFileRow).toBeVisible();
  });
});
