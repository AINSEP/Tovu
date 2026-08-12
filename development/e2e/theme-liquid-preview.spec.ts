import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Regression coverage for the owner-reported bug (2026-08-12): "clicking a .liquid file
 * downloads it instead of showing it" — reproduced across two sessions on `entry.liquid`,
 * `home.liquid`, and `product.liquid`, the required/near-required templates every `templated`-tier
 * theme ships (`src/themes/templated/storefront/templates/`, `.../fashion-modern/templates/`).
 *
 * Root cause: `ThemeExplore.tsx`'s Explore screen already has a proper file-preview pipeline (fetch
 * the source through the admin API, render it in a viewer) for every OTHER file kind, but a
 * `.liquid` template arrived from the theme-detail listing route
 * (`src/server/routes/admin/themes/explore.ts`) with `readable: false` — its `TEXT_READABLE_EXTENSIONS`
 * allowlist predates `.liquid` templates being explorable at all. `readable: false` sent
 * `previewSrcFor` (`ThemeExplore.tsx`) down its "not readable" branch, which points an `<iframe>`
 * straight at the raw `/theme-assets/{theme}/{path}` URL instead of fetching text through the API.
 * `express.static` serves `.liquid` as `application/octet-stream` (a DELIBERATE, security-reviewed
 * choice — see `theme-static-assets.ts`'s own doc comment; this fix does not touch it, and must not),
 * so navigating an iframe to that URL makes the browser download the file instead of rendering
 * anything inside the frame — exactly the reported symptom.
 *
 * Fixed client-side only (`apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts`): a
 * `.liquid` path is now treated as `readable` regardless of what the listing route reported, because
 * the GET-file route (`readThemeFile`) already returns any file's content as UTF-8 text unconditionally
 * — only the listing's classification was stale. The server's static-asset content-type and the
 * PUT-time write allowlist are both untouched: this is read-only SOURCE preview, not template
 * execution or an edit surface.
 *
 * Verified RED before the fix (private headless Chromium against this suite's own hermetic
 * `TOVU_DB=memory` boot, `development/playwright.theme-liquid-preview.config.ts`): clicking
 * `entry.liquid` fired a real Playwright `download` event, and the HTML tab showed the "This is a
 * binary file" notice instead of any source — see this suite's handoff report for the captured run.
 * Verified GREEN after: no download fires, and the HTML tab shows the real Liquid source.
 */
test.describe("theme Explore — .liquid template preview", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("clicking entry.liquid shows its source instead of downloading it", async ({ page }) => {
    // `storefront` (templated tier) is discovered at boot like any other theme on disk — no
    // marketplace download needed — so Explore is reachable directly by URL, the same
    // `?theme=` query-string shape `Themes.tsx`'s own "Explore" button navigates to.
    await page.goto("/admin/themes/explore?theme=storefront");
    await page.locator(".theme-explore").waitFor({ state: "visible", timeout: 15_000 });

    const fileRow = page.getByRole("button", { name: "entry.liquid", exact: true });
    await fileRow.waitFor({ state: "visible", timeout: 10_000 });

    // Set up the listener BEFORE the click that used to trigger it — a real browser download
    // (Chromium fires this even when the navigation that caused it happened inside an <iframe>,
    // which is exactly the pre-fix `ThemeExplorePreview` shape). Bounded wait, not a positive
    // assertion target: the whole point is that this must NOT resolve.
    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 }).catch(() => null);

    // Explore opens on the "Preview" tab by default — this is the exact click the owner made
    // ("clicking a .liquid file downloads it"), no tab-switching involved.
    await fileRow.click();

    const download = await downloadPromise;
    expect(download, download ? `unexpected browser download: ${download.suggestedFilename()}` : "no download expected").toBeNull();

    // Switch to the HTML tab to confirm the fix's actual deliverable: readable source, not just
    // "no crash". `.page-html-source` only renders once `readable` is true (binary files render a
    // "no editable source" notice instead — see `ThemeExploreHtmlPane`).
    await page.getByRole("tab", { name: "HTML" }).click();
    const sourceArea = page.locator(".page-html-source");
    await expect(sourceArea).toBeVisible({ timeout: 5_000 });

    // Real Liquid source, not an empty/placeholder textarea — `render_block` is a real tag this
    // theme's own `entry.liquid` uses (see `src/themes/templated/storefront/templates/entry.liquid`).
    await expect(sourceArea).toHaveValue(/render_block/);

    // Read-only, matching the server's write gate (`isThemeFileWritable` — `.liquid` is not in
    // `TEXT_READABLE_EXTENSIONS`, so PUT still refuses it): this fix adds preview, not editing.
    await expect(sourceArea).toHaveAttribute("readonly", "");

    await page.screenshot({
      path: "development/e2e/theme-liquid-preview.spec.ts-snapshots/liquid-template-preview.png",
      fullPage: true,
    });
  });
});
