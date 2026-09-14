import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Regression coverage for an owner-reported bug (2026-09-14): "Theme editor goes blank and
 * read-only briefly on every file load" — the HTML tab of the theme Explore screen.
 *
 * Root cause: `use-theme-explore.hooks.ts`'s `select` committed the clicked file as `selected` before
 * its text was read. `sourceLoaded` then went false, and `themeExploreHtmlMode` rendered the empty,
 * read-only "unloaded" source until `getThemeFile` resolved — on every switch. That state exists to
 * stop a stale buffer being saved over another file (12232a2b), so it cannot simply be removed.
 *
 * Fix: in the HTML view, a click on a readable file waits for that file's text and opens it in one
 * render; the file list highlights the click at once through `highlightedPath`.
 *
 * Why a real browser: the flash is a rendered state between two React commits, and jsdom paints
 * nothing. Every animation frame is sampled, and each file read is held for {@link READ_DELAY_MS} so
 * the window is wide enough to hit reliably. Before the fix every switch sampled an empty read-only
 * textarea for the whole held read.
 */

const READ_DELAY_MS = 400;

test.describe("theme Explore — switching files in the HTML view never blanks the editor (2026-09-14 regression)", () => {
  test("the editor shows real, editable text on every frame of a file switch", async ({ page }) => {
    await page.route(/\/themes\/[^/]+\/file\?path=/, async (route) => {
      if (route.request().method() === "GET") await new Promise((resolve) => setTimeout(resolve, READ_DELAY_MS));
      await route.continue();
    });
    await loginAsAdmin(page);
    await page.goto("/admin/themes/explore?theme=basic", { waitUntil: "domcontentloaded" });
    const rows = page.locator(".theme-explore-file-row button[title]");
    await rows.first().waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("tab", { name: "HTML" }).click();
    const editor = page.locator(".page-html-source");
    await expect(page.getByRole("textbox", { name: "Theme file source", exact: true })).not.toHaveValue("", {
      timeout: 10_000,
    });

    const titles = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("title") ?? ""));
    const pages = titles.filter((title) => title.endsWith(".html")).slice(0, 3);
    expect(pages).toHaveLength(3);

    await page.evaluate(() => {
      const store = window as unknown as { __switchSamples: Array<{ len: number; readOnly: boolean }> };
      store.__switchSamples = [];
      const sample = () => {
        const textarea = document.querySelector<HTMLTextAreaElement>(".page-html-source");
        if (textarea) store.__switchSamples.push({ len: textarea.value.length, readOnly: textarea.readOnly });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    for (const target of [pages[1]!, pages[2]!, pages[0]!]) {
      const before = await editor.inputValue();
      const row = page.locator(`.theme-explore-file-row button[title="${target}"]`);
      await row.click();
      // The highlight follows the click straight away, while the held read is still out.
      await expect(row).toHaveAttribute("aria-current", "true", { timeout: READ_DELAY_MS });
      await expect(editor).not.toHaveValue(before, { timeout: 10_000 });
    }

    const samples = await page.evaluate(
      () => (window as unknown as { __switchSamples: Array<{ len: number; readOnly: boolean }> }).__switchSamples
    );
    expect(samples.length).toBeGreaterThan(20);
    expect(samples.filter((s) => s.len === 0 || s.readOnly)).toEqual([]);
  });
});
