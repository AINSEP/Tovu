import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

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
 *
 * 2026-08-12 follow-up (same owner report, different half of it): "I still don't see a preview of
 * the liquid with the styles at all." The fix above closed the SOURCE half — the HTML tab. It never
 * touched the Preview tab, which used to show only an honest "not built yet" notice for a `.liquid`
 * file — `theme-page-preview.ts` had no templated-tier render pipeline at all, only the `static`-tier
 * `renderStaticPage`/`renderStaticPartial` branch.
 *
 * 2026-08-12, same day, the actual render pipeline: `theme-page-preview.ts` gained a THIRD route,
 * `/theme-explore/{themeId}/template/{templateId}`, gated on `theme.set` (`authorizeThemeSetPermission`,
 * shared with every other Explore route via `explore.ts`) — unlike its two `static`-tier siblings,
 * which stay ungated. It renders through the real pipeline (`renderSite`/`renderLiquidInSandbox`),
 * against real published-post content and a deliberately empty products list (containment for the
 * `product.liquid`-in-fashion-modern `{{ product.description | raw }}` sink — see that route's own
 * file header). `renderSite`'s new `liquidTemplateIdOverride` makes sure the EXACT file selected
 * renders, not whichever file the live site's own route-based resolution would prefer (`post` over
 * `entry`, when both exist). `previewSrcFor` (`ThemeExplore.tsx`) now points a `.liquid` file's preview
 * at this route; the old "not built yet" notice is gone. The second test below now pins the real
 * render instead of that notice.
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

  test("the Preview tab renders entry.liquid through the real theme pipeline, styled", async ({ page }) => {
    await page.goto("/admin/themes/explore?theme=fashion-modern");
    await page.locator(".theme-explore").waitFor({ state: "visible", timeout: 15_000 });

    const fileRow = page.getByRole("button", { name: "entry.liquid", exact: true });
    await fileRow.waitFor({ state: "visible", timeout: 10_000 });
    await fileRow.click();

    // No tab switch here on purpose — Preview is the DEFAULT tab (`useState<ThemeExploreView>
    // ("preview")`, `use-theme-explore.hooks.ts`), and this is the exact screen the owner landed on
    // when they reported "I still don't see a preview ... at all".
    const iframe = page.locator(".theme-explore-main .page-preview-iframe");
    await expect(iframe).toHaveCount(1, { timeout: 10_000 });
    // Not sandboxed into an opaque/no-script mode: theme JS (nav toggles, reveal-on-scroll) needs to
    // run for a real preview, same as the pre-existing static-tier branch — but `allow-same-origin` is
    // deliberately absent, so this document can never read the admin's own cookies/storage even though
    // it runs in a real browsing context.
    await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");

    const frame = page.frameLocator(".theme-explore-main .page-preview-iframe");
    // Real theme markup, not an empty shell or an error comment — `fashion-modern`'s own nav renders
    // "Journal" as a nav link (also appears in the entry's own kicker/breadcrumb, hence `.first()`
    // rather than a bare `getByText`, which resolves ambiguously across all of them).
    await expect(frame.getByRole("link", { name: "Journal", exact: true })).toBeVisible({ timeout: 10_000 });

    // Real CSS applied, not a bare unstyled document — `styles.css` sets the body font away from the
    // browser default serif.
    const bodyFont = await frame.locator("body").evaluate((el) => getComputedStyle(el).fontFamily);
    expect(bodyFont).toMatch(/inter/i);

    // The old "not built yet" notice is gone entirely for a `.liquid` file now that it has a real
    // render.
    await expect(page.getByText(/templated themes don't have a rendered preview yet/i)).not.toBeVisible();

    await page.screenshot({
      path: "development/e2e/theme-liquid-preview.spec.ts-snapshots/liquid-template-rendered-preview.png",
      fullPage: true,
    });
  });

  test("a non-.liquid file in a templated theme still gets the generic 'select a file' placeholder, not the template notice", async ({ page }) => {
    await page.goto("/admin/themes/explore?theme=fashion-modern");
    await page.locator(".theme-explore").waitFor({ state: "visible", timeout: 15_000 });

    // `theme.json` — a `config`-group file with no preview URL of its own (`previewSrcFor` returns
    // `null` for it) — pins the boundary the owner's own screenshot review raised: a templated theme's
    // OTHER files must not show template-specific copy, only the one generic message every other
    // previewless file (CSS/JS/JSON) already shows.
    const fileRow = page.getByRole("button", { name: "theme.json", exact: true });
    await fileRow.waitFor({ state: "visible", timeout: 10_000 });
    await fileRow.click();

    await expect(page.getByText(/^select a file to preview\.?$/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/templated themes don't have a rendered preview yet/i)).not.toBeVisible();
    await expect(page.locator(".theme-explore-main .page-preview-iframe")).toHaveCount(0);
  });
});
