// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import { expect } from "../support/bug-pin-fixtures.js";
import { loginAsAdmin, pinSessionRequest } from "../support/bug-pin-auth.js";
import { type Page } from "../support/bug-pin-fixtures.js";

// Preserve the retired configs' effective Chromium viewport (Desktop Chrome or browser default).
// Nested test.use and explicit resizes still win.
test.use({ viewport: { width: 1280, height: 720 } });

// Migrated from theme-explore-file-switch.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: theme-explore-file-switch", () => {
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

// STALE PIN UPDATED: 85e29beac renamed basic to tovu-theme; Explore routes require the exact id.
const READ_DELAY_MS = 400;

test.describe("theme Explore — switching files in the HTML view never blanks the editor (2026-09-14 regression)", () => {
  test("the editor shows real, editable text on every frame of a file switch", async ({ page }) => {
    let heldRead: { path: string; reached: boolean; wait: Promise<void> } | undefined;
    await page.route(/\/themes\/[^/]+\/file\?path=/, async (route) => {
      const pending = heldRead;
      if (route.request().method() === "GET" && pending?.path === new URL(route.request().url()).searchParams.get("path")) {
        pending.reached = true;
        await pending.wait;
      }
      await route.continue();
    });
    await loginAsAdmin(page);
    await page.goto("/admin/themes/explore?theme=tovu-theme", { waitUntil: "domcontentloaded" });
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

    const contents = new Map<string, string>();
    for (const path of pages) {
      const response = await pinSessionRequest({ page, url: `/api/admin/v1/workspaces/workspace-local/themes/tovu-theme/file?path=${encodeURIComponent(path)}` });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.path).toBe(path);
      expect(body.content.length).toBeGreaterThan(0);
      contents.set(path, body.content);
    }
    expect(new Set(contents.values()).size).toBe(3);

    await page.evaluate(() => {
      const store = window as unknown as { __switchSamples: Array<{ present: boolean; len: number; readOnly: boolean }> };
      store.__switchSamples = [];
      const sample = () => {
        const textarea = document.querySelector<HTMLTextAreaElement>(".page-html-source");
        store.__switchSamples.push({ present: textarea !== null, len: textarea?.value.length ?? 0, readOnly: textarea?.readOnly ?? true });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    for (const target of [pages[1]!, pages[2]!, pages[0]!]) {
      const before = await editor.inputValue();
      const row = page.locator(`.theme-explore-file-row button[title="${target}"]`);
      let release!: () => void;
      heldRead = { path: target, reached: false, wait: new Promise<void>((resolve) => { release = resolve; }) };
      try {
        await row.click();
        await expect.poll(() => heldRead?.reached).toBe(true);
        // Assert the highlight and held buffer before the response can arrive.
        await expect(row).toHaveAttribute("aria-current", "true");
        await expect(editor).toHaveValue(before);
        await page.waitForTimeout(READ_DELAY_MS); // keep the sampled paint window open
      } finally {
        heldRead = undefined;
        release();
      }
      await expect(editor).not.toHaveValue(before, { timeout: 10_000 });
      await expect(editor).toHaveValue(contents.get(target)!, { timeout: 10_000 });
    }

    const samples = await page.evaluate(
      () => (window as unknown as { __switchSamples: Array<{ present: boolean; len: number; readOnly: boolean }> }).__switchSamples
    );
    expect(samples.length).toBeGreaterThan(20);
    expect(samples.filter((s) => !s.present || s.len === 0 || s.readOnly)).toEqual([]);
  });

  /**
   * T91: the click-hold fix above only covered a click. A `?file=`/`?page=` change on the ALREADY
   * MOUNTED screen (Back/Forward, an in-app link, or the URL catching up after a click) took a
   * different, unguarded path in `use-theme-explore.hooks.ts`'s initial-load effect and still
   * flashed unloaded. Fix: `requestedSelectionMove` holds a reselect the same way `select` holds a
   * click.
   */
  test("E1: a ?file= navigation on the open screen, and Back, show real editable text on every frame", async ({ page }) => {
    await page.route(/\/themes\/[^/]+\/file\?path=/, async (route) => {
      if (route.request().method() === "GET") await new Promise((resolve) => setTimeout(resolve, READ_DELAY_MS));
      await route.continue();
    });
    await loginAsAdmin(page);
    await page.goto("/admin/themes/explore?theme=tovu-theme", { waitUntil: "domcontentloaded" });
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

    const contents = new Map<string, string>();
    for (const path of pages) {
      const response = await pinSessionRequest({ page, url: `/api/admin/v1/workspaces/workspace-local/themes/tovu-theme/file?path=${encodeURIComponent(path)}` });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.path).toBe(path);
      expect(body.content.length).toBeGreaterThan(0);
      contents.set(path, body.content);
    }
    expect(new Set(contents.values()).size).toBe(3);

    await page.evaluate(() => {
      const store = window as unknown as { __switchSamples: Array<{ present: boolean; len: number; readOnly: boolean }> };
      store.__switchSamples = [];
      const sample = () => {
        const textarea = document.querySelector<HTMLTextAreaElement>(".page-html-source");
        store.__switchSamples.push({ present: textarea !== null, len: textarea?.value.length ?? 0, readOnly: textarea?.readOnly ?? true });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    for (const target of [pages[1]!, pages[2]!]) {
      const before = await editor.inputValue();
      await page.evaluate((href) => {
        history.pushState(null, "", href);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, `/admin/themes/explore?theme=tovu-theme&file=${encodeURIComponent(target)}`);
      await expect(editor).not.toHaveValue(before, { timeout: 10_000 });
      await expect(editor).toHaveValue(contents.get(target)!, { timeout: 10_000 });
    }

    const beforeBack = await editor.inputValue();
    await page.goBack();
    await expect(editor).not.toHaveValue(beforeBack, { timeout: 10_000 });
    await expect(editor).toHaveValue(contents.get(pages[1]!)!, { timeout: 10_000 });

    const samples = await page.evaluate(
      () => (window as unknown as { __switchSamples: Array<{ present: boolean; len: number; readOnly: boolean }> }).__switchSamples
    );
    expect(samples.length).toBeGreaterThan(20);
    expect(samples.filter((s) => !s.present || s.len === 0 || s.readOnly)).toEqual([]);
  });

  /**
   * T91: renaming the open file went through a different path than a click too — the selection moved
   * (`performRename`) without moving the loaded-file marker, so the same "unloaded" flash showed, and
   * the follow-up re-read silently discarded any unsaved edit. Fix: `loadedFileAfterRename` moves the
   * marker with the rename instead of re-reading. Fully intercepted — nothing is renamed on disk.
   */
  test("E2: renaming the open file shows real editable text on every frame, with no re-read", async ({ page }) => {
    await page.route(/\/themes\/[^/]+\/file\?path=/, async (route) => {
      if (route.request().method() === "GET") await new Promise((resolve) => setTimeout(resolve, READ_DELAY_MS));
      await route.continue();
    });
    await loginAsAdmin(page);
    await page.goto("/admin/themes/explore?theme=tovu-theme", { waitUntil: "domcontentloaded" });
    const rows = page.locator(".theme-explore-file-row button[title]");
    await rows.first().waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("tab", { name: "HTML" }).click();
    const editor = page.locator(".page-html-source");
    await expect(page.getByRole("textbox", { name: "Theme file source", exact: true })).not.toHaveValue("", {
      timeout: 10_000,
    });

    const titles = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("title") ?? ""));
    const css = titles.find((title) => title.endsWith(".css"));
    expect(css).toBeTruthy();
    const cssPath = css!;

    let renamedFrom: string | null = null;
    let renamedTo: string | null = null;
    await page.route(/\/themes\/[^/]+\/file\/rename$/, async (route) => {
      const body = route.request().postDataJSON() as { path: string; name: string };
      renamedFrom = body.path;
      const dir = body.path.slice(0, body.path.lastIndexOf("/") + 1);
      renamedTo = dir + body.name;
      await route.fulfill({
        json: {
          path: renamedTo,
          group: "style",
          readable: true,
          editable: true,
          resettable: false,
          modified: null,
          renamedFrom: body.path,
        },
      });
    });
    await page.route(/\/workspaces\/[^/]+\/themes\/[^/?]+(\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      if (renamedTo !== null && Array.isArray(json?.files)) {
        json.files = json.files.map((f: { path: string }) => (f.path === renamedFrom ? { ...f, path: renamedTo } : f));
      }
      await route.fulfill({ response, json });
    });

    const fileReads: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/file?path=")) fileReads.push(request.url());
    });

    const openedFromValue = await editor.inputValue();
    await page.locator(`.theme-explore-file-row button[title="${cssPath}"]`).click();
    // The click HOLDS the previously-open file's text on screen until the css file's own text lands
    // (same hold this whole spec is regression-testing) — waiting for non-empty alone would pass
    // instantly on the stale held text, so wait for the value to actually change instead.
    await expect(editor).not.toHaveValue(openedFromValue, { timeout: 10_000 });

    const before = await editor.inputValue();
    await page.evaluate(() => {
      const store = window as unknown as { __switchSamples: Array<{ present: boolean; len: number; readOnly: boolean }> };
      store.__switchSamples = [];
      const sample = () => {
        const textarea = document.querySelector<HTMLTextAreaElement>(".page-html-source");
        store.__switchSamples.push({ present: textarea !== null, len: textarea?.value.length ?? 0, readOnly: textarea?.readOnly ?? true });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await page.locator(`.theme-explore-file-row button[title="${cssPath}"]`).dblclick();
    await page.locator(".theme-explore-rename-input").fill("t91-renamed.css");
    await page.locator(".theme-explore-rename-input").press("Enter");

    await expect(page.locator('.theme-explore-file-row button[title$="t91-renamed.css"]')).toHaveAttribute(
      "aria-current",
      "true",
      { timeout: 10_000 }
    );

    const samples = await page.evaluate(
      () => (window as unknown as { __switchSamples: Array<{ present: boolean; len: number; readOnly: boolean }> }).__switchSamples
    );
    expect(samples.filter((s) => !s.present || s.len === 0 || s.readOnly)).toEqual([]);
    expect(await editor.inputValue()).toBe(before);
    expect(fileReads.some((url) => new URL(url).searchParams.get("path") === renamedTo)).toBe(false);

    await page.unrouteAll();
  });
});
});

// Migrated from theme-explore-narrow-sidebar.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: theme-explore-narrow-sidebar", () => {
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
  for (const width of [500, 700]) {
  test(`the file list has non-zero height and reachable rows at ${width}px`, async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ ...NARROW_VIEWPORT, width });
    await page.goto("/admin/themes/explore?theme=tovu-theme", { waitUntil: "domcontentloaded" });

    const fileList = page.locator(".theme-explore-files").first();
    await fileList.waitFor({ state: "attached", timeout: 10_000 });

    // The bug's real symptom: present in the DOM but rendered at 0px tall, so nothing inside it is
    // reachable. A non-zero bounding-box height is the honest "is it actually visible" check.
    const box = await fileList.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(120);
    // TH-4 (mobile catalog, 2026-10-06) deliberately removes the phone's nested scroll trap.
    // Tablets retain the cap; phones must grow with the rows and use the page's scroller.
    if (width > 640) expect(box!.height).toBeLessThanOrEqual(241);
    else {
      expect(box!.height).toBeGreaterThan(240);
      expect(await fileList.evaluate((el) => getComputedStyle(el).overflowY)).toBe("visible");
    }

    const pagesHeading = page.locator(".theme-explore-files-heading", { hasText: "Pages" });
    await expect(pagesHeading).toBeVisible();

    const firstFileRow = page.locator(".theme-explore-file-row").first();
    await expect(firstFileRow).toBeVisible();
    await expect(firstFileRow).toBeInViewport();
    const lastFileRow = page.locator(".theme-explore-file-row").last();
    const lastButton = lastFileRow.locator("button").first();
    const lastBox = await lastFileRow.boundingBox();
    expect(lastBox).not.toBeNull();
    if (width > 640) {
      expect(lastBox!.y).toBeGreaterThanOrEqual(box!.y + box!.height);
      await fileList.hover();
      await page.mouse.wheel(0, 10_000);
    } else {
      expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(box!.y + box!.height + 1);
      await lastButton.scrollIntoViewIfNeeded();
      expect(await fileList.evaluate((el) => el.scrollTop)).toBe(0);
    }
    await expect.poll(() => lastFileRow.evaluate((el) => {
      const row = el.getBoundingClientRect();
      const list = el.closest(".theme-explore-files")!.getBoundingClientRect();
      return row.top >= list.top && row.bottom <= list.bottom + 1;
    })).toBe(true);
    await lastButton.click();
    await expect(lastButton).toHaveClass(/\bis-active\b/);
    // With a growing phone list, the preview is reached through the same page scroll.
    if (width <= 640) await page.locator(".theme-explore-main").scrollIntoViewIfNeeded();
    await expect(page.locator(".theme-explore-main")).toBeInViewport();
    const previewBox = await page.locator(".theme-explore-main").boundingBox();
    expect(previewBox).not.toBeNull();
    expect(previewBox!.y).toBeLessThan(NARROW_VIEWPORT.height);
  });
  }
});
});

// Migrated from theme-liquid-preview.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: theme-liquid-preview", () => {
/**
 * @file Regression coverage for the owner-reported bug (2026-08-12): "clicking a .liquid file
 * downloads it instead of showing it" — reproduced across two sessions on `entry.liquid`,
 * `home.liquid`, and `product.liquid`, the required/near-required templates every `templated`-tier
 * theme ships (`content/themes/templated/storefront/templates/`, `.../fashion-modern/templates/`).
 *
 * Root cause: `ThemeExplore.tsx`'s Explore screen already has a proper file-preview pipeline (fetch
 * the source through the admin API, render it in a viewer) for every OTHER file kind, but a
 * `.liquid` template arrived from the theme-detail listing route
 * (`src/server/inbound/admin-http/routes/themes/explore.ts`) with `readable: false` — its `TEXT_READABLE_EXTENSIONS`
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
    // v2's first page is entry.liquid. Start on home so the tested click makes a real selection.
    const homeSource = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/themes/storefront/file") && url.searchParams.get("path") === "render/pages/home.liquid";
    });
    await page.goto("/admin/themes/explore?theme=storefront&file=render%2Fpages%2Fhome.liquid");
    expect((await homeSource).ok()).toBe(true);
    await page.locator(".theme-explore").waitFor({ state: "visible", timeout: 15_000 });

    const fileRow = page.getByRole("button", { name: "entry.liquid", exact: true });
    await fileRow.waitFor({ state: "visible", timeout: 10_000 });

    // Set up the listener BEFORE the click that used to trigger it — a real browser download
    // (Chromium fires this even when the navigation that caused it happened inside an <iframe>,
    // which is exactly the pre-fix `ThemeExplorePreview` shape).
    // assertion target: the listener covers selection and the later source assertions.
    const downloads: string[] = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    const sourceResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/themes/storefront/file") && url.searchParams.get("path")?.endsWith("/entry.liquid") === true;
    });

    // Explore opens on the "Preview" tab by default — this is the exact click the owner made
    // ("clicking a .liquid file downloads it"), no tab-switching involved.
    await fileRow.click();

    const response = await sourceResponse;
    expect(response.ok()).toBe(true);
    const selectedSource = await response.json();
    expect(selectedSource.path).toMatch(/\/entry\.liquid$/);

    // Switch to the HTML tab to confirm the fix's actual deliverable: readable source, not just
    // "no crash". `.page-html-source` only renders once `readable` is true (binary files render a
    // "no editable source" notice instead — see `ThemeExploreHtmlPane`).
    await page.getByRole("tab", { name: "HTML" }).click();
    const sourceArea = page.locator(".page-html-source");
    await expect(sourceArea).toBeVisible({ timeout: 5_000 });

    // Real Liquid source, not an empty/placeholder textarea — `render_block` is a real tag this
    // theme's own `entry.liquid` uses (see `content/themes/templated/storefront/templates/entry.liquid`).
    await expect(sourceArea).toHaveValue(/render_block/);
    await expect(sourceArea).toHaveValue(selectedSource.content);
    await expect(sourceArea).toHaveValue(/Storefront — entry/);
    expect(downloads).toEqual([]);

    // Read-only, matching the server's write gate (`isThemeFileWritable` — `.liquid` is not in
    // `TEXT_READABLE_EXTENSIONS`, so PUT still refuses it): this fix adds preview, not editing.
    await expect(sourceArea).toHaveAttribute("readonly", "");

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
    await expect(iframe).toHaveAttribute("src", /\/theme-explore\/fashion-modern\/template\/entry\?/);

    const frame = page.frameLocator(".theme-explore-main .page-preview-iframe");
    // Real theme markup, not an empty shell or an error comment — `fashion-modern`'s own nav renders
    // "Journal" as a nav link (also appears in the entry's own kicker/breadcrumb, hence `.first()`
    // rather than a bare `getByText`, which resolves ambiguously across all of them).
    await expect(frame.getByRole("link", { name: "Journal", exact: true })).toBeVisible({ timeout: 10_000 });

    // Real CSS applied, not a bare unstyled document — `styles.css` sets the body font away from the
    // browser default serif.
    // This entry-only layout is outside the post conditional, so it also exists with no posts.
    await expect(frame.locator("main.wrap--article")).toHaveCount(1);
    const bodyFont = await frame.locator("body").evaluate((el) => getComputedStyle(el).fontFamily);
    expect(bodyFont).toMatch(/inter/i);

    // The old "not built yet" notice is gone entirely for a `.liquid` file now that it has a real
    // render.
    await expect(page.getByText(/templated themes don't have a rendered preview yet/i)).not.toBeVisible();

  });

  test("selecting theme.json displays its actual JSON preview", async ({ page }) => {
    await page.goto("/admin/themes/explore?theme=fashion-modern");
    await page.locator(".theme-explore").waitFor({ state: "visible", timeout: 15_000 });

    // JSON uses the raw asset viewer, like every other non-template file.
    const fileRow = page.getByRole("button", { name: "theme.json", exact: true });
    await fileRow.waitFor({ state: "visible", timeout: 10_000 });
    await fileRow.click();

    await expect(page.getByText(/^select a file to preview\.?$/i)).not.toBeVisible();
    await expect(page.getByText(/templated themes don't have a rendered preview yet/i)).not.toBeVisible();
    const iframe = page.locator(".theme-explore-main .page-preview-iframe");
    await expect(iframe).toHaveCount(1);
    // Preview refresh gives raw assets a revision namespace so edits cannot reuse stale bytes.
    await expect(iframe).toHaveAttribute("src", /\/theme-preview-assets\/[\w-]+\/fashion-modern\/theme\.json\?/);
    const body = page.frameLocator(".theme-explore-main .page-preview-iframe").locator("body");
    await expect(body).toContainText('"name"');
    await expect(body).toContainText("Fashion Modern");
  });
});
});

// Migrated from theme-visual.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: theme-visual", () => {
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

// The shipped theme vendors both font families. Require the actual faces, including load success,
// so a missing local asset cannot silently produce fallback-font screenshots.
async function waitForFonts(page: Page): Promise<void> {
  const fonts = await page.evaluate(async () => {
    const families = ["Geist", "Geist Mono"];
    return Promise.all(families.map(async (family) => {
      const faces = await document.fonts.load(`400 16px "${family}"`);
      return { family, count: faces.length, loaded: faces.every((face) => face.status === "loaded") };
    }));
  });
  for (const font of fonts) {
    expect(font.count, font.family).toBeGreaterThan(0);
    expect(font.loaded, font.family).toBe(true);
  }
}

async function expectKeyNavigation(page: Page, mobile = false): Promise<void> {
  const header = page.locator(".site-header");
  await expect(header).toBeVisible();
  for (const name of ["Pricing", "Docs", "Blog", "About"]) {
    // 948706418 hides desktop navigation while the modal drawer is closed on mobile.
    // Count its links structurally; AW-1 below opens the drawer and checks reachability.
    const link = header.locator(".main-nav").getByRole("link", { name, exact: true, includeHidden: mobile });
    await expect(link).toHaveCount(1);
    if (!mobile) {
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
  }
  // STALE PIN UPDATED: 415da8fc4 deliberately renamed the header CTA.
  // The current theme calls both CTAs "Download"; keep this scoped to the header action.
  await expect(header.locator(".nav-actions").getByRole("link", { name: "Download", exact: true })).toBeVisible();
}

test.describe("theme visual regression (AW-2)", () => {
  test("download installation command copy writes the displayed command to the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    // Theme marketing pages are off by default; publish this fixture through the owner API.
    const published = await pinSessionRequest({ page,
      url: "/api/admin/v1/workspaces/workspace-local/themes/tovu-theme/page/publish",
      method: "POST", data: { page: "download", published: true },
    });
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ page: "download", published: true });
    await page.goto("/download");
    const command = "curl -fsSL basic.sh/install | sh";
    await expect(page.locator(".install-cmd code")).toHaveText(command);
    await page.evaluate(() => navigator.clipboard.writeText("previous clipboard value"));
    await page.locator(".install-cmd button").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(command);
  });
  test("home — desktop 1280", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareForScreenshot(page);
    await page.goto("/");
    await waitForFonts(page);
    await expectKeyNavigation(page);
    await expect(page).toHaveScreenshot("home-desktop.png", { fullPage: true });
  });

  test("home — wide 2560 (guards the full-bleed band rhythm)", async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1000 });
    await prepareForScreenshot(page);
    await page.goto("/");
    await waitForFonts(page);
    await expectKeyNavigation(page);
    await expect(page).toHaveScreenshot("home-wide.png", { fullPage: true });
  });

  test("home — mobile 390, drawer CLOSED (AW-1 bug lives in the open state — not baselined here)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareForScreenshot(page);
    await page.goto("/");
    await waitForFonts(page);
    await expectKeyNavigation(page, true);
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
    await expectKeyNavigation(page);
    await expect(page.locator("article.post-detail")).toBeVisible();
    await expect(page).toHaveScreenshot("post-welcome.png", { fullPage: true });
  });
});

/**
 * todos.md AW-1 — mobile nav drawer clipping.
 *
 * todos.md's own repro (a hard-coded `.nav-menu { top: 3.7rem }` in `themes/tovu-official/`) is
 * stale: `tovu-official` no longer exists in this repo and the live workspace's active theme
 * (confirmed via `presentation_settings` in `sites/tovu-com/content.db`, and matching
 * `server/seed.ts`'s own seeded default) is `basic`, whose mobile nav
 * (`content/themes/static/tovu-theme/css/theme.css`, `@media (max-width: 640px)`) instead positions
 * `.main-nav` with `position: absolute; top: 100%` inside the sticky `.site-header` — i.e. the
 * "drive the offset from real header height" fix todos.md lists as a *candidate* already appears
 * to be in place. These assertions exist to prove that empirically (geometry, not just a pixel
 * diff) rather than trust the CSS reading: if they pass with no code change, that itself is the
 * evidence the bug does not reproduce in the theme actually being served.
 */
// 948706418 replaced the header dropdown with a native modal drawer; 415da8fc4 renamed
// its CTA. Keep AW-1's reachability/clipping contract against the current menu structure.
test.describe("AW-1 — mobile nav drawer (tovu-theme)", () => {
  test("modal drawer opens inside the viewport, keeps links and CTA reachable, and closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareForScreenshot(page);
    await page.goto("/");
    await waitForFonts(page);

    const toggle = page.locator(".nav-toggle");
    const drawer = page.locator("dialog.mnav");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(drawer).toBeVisible();
    expect(await drawer.evaluate((element) => element.matches(":modal"))).toBe(true);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox).not.toBeNull();
    expect(drawerBox!.x).toBeGreaterThanOrEqual(-1);
    expect(drawerBox!.y).toBeGreaterThanOrEqual(-1);
    expect(drawerBox!.x + drawerBox!.width).toBeLessThanOrEqual(391);
    expect(drawerBox!.y + drawerBox!.height).toBeLessThanOrEqual(845);

    const nav = drawer.locator(".mnav-body");
    const links = nav.locator("a:visible");
    expect(await links.count()).toBeGreaterThan(0);
    for (const link of await links.all()) {
      // A long/nested menu may scroll inside the drawer; every visible link must be reachable.
      await link.scrollIntoViewIfNeeded();
      const box = await link.boundingBox();
      const navBox = await nav.boundingBox();
      expect(box).not.toBeNull();
      expect(navBox).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(navBox!.x - 1);
      expect(box!.y).toBeGreaterThanOrEqual(navBox!.y - 1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(navBox!.x + navBox!.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(navBox!.y + navBox!.height + 1);
    }
    const cta = drawer.locator(".mnav-foot").getByRole("link", { name: "Download", exact: true });
    await expect(cta).toBeVisible();
    await expect(cta).toBeInViewport();
    await expect(page).toHaveScreenshot("home-mobile-390-drawer-open.png", {
      clip: { x: 0, y: 0, width: 390, height: 844 },
    });
    // The header toggle is inert while showModal() is open; close through its real control.
    await drawer.getByRole("button", { name: "Close menu", exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

/**
 * todos.md AW-4 — wide-screen content-page layout.
 *
 * todos.md's own repro (`tovu/entry-content` → `.wrap` → `article.entry` → `.prose` with no auto
 * margins, in `themes/tovu-official/`) is stale for the same reason as AW-1 above. `basic` theme's
 * equivalent structure is a single element carrying BOTH `.wrap` and `.post-detail`
 * (`blog-post.html`: `<article class="post-detail wrap">`, and `page-shell.html`:
 * `<article class="wrap post-detail">`), and `.post-detail` itself already declares
 * `margin: 0 auto` (`content/themes/static/tovu-theme/css/theme.css`) — so there is no inner "prose"
 * box left anchored inside an outer centered wrap. These assertions check the actual rendered
 * gutters on both a generic post (`/welcome`, `blog-post.html`) and a generic content page
 * (`/about`, a DB-seeded post — NOT the theme's own bundled marketing `about.html` — that renders
 * through the same `blog-post.html` template per `server/seed.ts`'s file comment: "these explainer
 * pages... render at /:slug through the active theme's entry template").
 */
test.describe("AW-4 — wide-screen content-page layout (basic theme)", () => {
  const widths = [1280, 1920, 2560];
  const pages: Array<{ path: string; label: string }> = [
    { path: "/welcome", label: "welcome (post)" },
    { path: "/about", label: "about (generic content page)" },
  ];

  for (const { path: pagePath, label } of pages) {
    for (const width of widths) {
      test(`${label} at ${width}px — centered column, balanced gutters`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await prepareForScreenshot(page);
        await page.goto(pagePath);
        await waitForFonts(page);

        const article = page.locator("article.post-detail");
        const box = await article.boundingBox();
        expect(box).not.toBeNull();

        const leftGutter = box!.x;
        const rightGutter = width - (box!.x + box!.width);
        // Balanced gutters is the acceptance criterion itself: todos.md's bug is the article
        // anchored to the left with all the slack pushed into the right gutter. A small tolerance
        // absorbs the scrollbar's own width reducing the effective right-hand viewport.
        expect(Math.abs(leftGutter - rightGutter)).toBeLessThanOrEqual(20);
        // And the column must not have collapsed to (or near) the full viewport width — that
        // would hide a starved-gutter bug behind "both gutters are ~0".
        expect(box!.width).toBeLessThan(width * 0.9);
      });
    }
  }

  // Mobile case: below 720px, `.post-detail`'s own `max-width` never engages, so the article
  // fills the full viewport width and the "centered column" assertions above (which compare the
  // article's box against the viewport) can't observe anything — both gutters read as
  // (near-)zero and "balanced" either way. The real acceptance criterion at this width is that
  // `.wrap`'s `padding: 0 24px` gutter — the only thing standing between body text and both
  // screen edges once the max-width cap is inert — actually survives onto the rendered element,
  // rather than being reset by `.post-detail`'s own (later, same-specificity) `padding`
  // declaration. Asserted directly via computed padding rather than via a screenshot diff, since
  // a screenshot only fails once the visual delta crosses `maxDiffPixelRatio` (0.02) — a couple
  // of pixels of edge-to-edge text on a 390px baseline could plausibly land under that threshold.
  test("welcome (post) at 390px — real left/right gutter survives (mobile)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareForScreenshot(page);
    await page.goto("/welcome");
    await waitForFonts(page);

    const article = page.locator("article.post-detail");
    const padding = await article.evaluate((el) => {
      const style = getComputedStyle(el);
      return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) };
    });

    expect(padding.left).toBeGreaterThanOrEqual(20);
    expect(padding.left).toBeLessThanOrEqual(28);
    expect(padding.right).toBeGreaterThanOrEqual(20);
    expect(padding.right).toBeLessThanOrEqual(28);
  });
});

/** Exercise the shipped stylesheet with oversized replaced elements. The image fixture has
 * real 4:1 intrinsic dimensions and is decoded before measuring its responsive geometry. */
test("the shipped stylesheet clamps oversized video and iframe elements inside their container", async ({ page }) => {
  await page.goto("/welcome");
  const measurements = await page.evaluate(() => {
    const container = document.createElement("div");
    container.style.width = "200px";
    document.body.append(container);
    const boxes = ["video", "iframe"].map((tag) => {
      const element = document.createElement(tag);
      element.setAttribute("width", "800");
      element.setAttribute("height", "200");
      container.append(element);
      return { tag, width: element.getBoundingClientRect().width, available: container.clientWidth };
    });
    container.remove();
    return boxes;
  });
  expect(measurements).toHaveLength(2);
  for (const box of measurements) {
    expect(box.width, box.tag).toBeGreaterThan(0);
    expect(box.width, box.tag).toBeLessThanOrEqual(box.available);
  }
});

test("img keeps aspect ratio when HTML width/height attributes exceed the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 500, height: 400 });
  await page.goto("/welcome");

  const rect = await page.evaluate(async () => {
    const img = document.createElement("img");
    img.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="red"/></svg>');
    // 4:1 attribute aspect ratio, wider than the 500px viewport — `max-width: 100%` must clamp
    // the rendered width, and `height: auto` must scale the height to match, not leave it pinned.
    img.width = 800;
    img.height = 200;
    document.body.appendChild(img);
    await img.decode();
    const box = img.getBoundingClientRect();
    document.body.removeChild(img);
    return { width: box.width, height: box.height, availableWidth: document.body.clientWidth };
  });

  expect(rect.width).toBeGreaterThan(0);
  expect(rect.width).toBeLessThanOrEqual(Math.min(rect.availableWidth, 500));
  expect(rect.width).toBeLessThan(800);
  expect(rect.width / rect.height).toBeCloseTo(4, 3);
  expect(rect.height).toBeCloseTo(rect.width / 4, 3);
});
});

// Migrated from themes-presentation-request-timeout.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: themes-presentation-request-timeout", () => {
  // Preserve the retired config budget for hooks as well as the test body.
  test.describe.configure({ timeout: 100_000 });
/**
 * @file Real-browser regression cover for the Themes screen's "Loading themes…" forever-hang
 * (found live 2026-08-17: `apps/admin/src/features/themes/hooks/use-themes.hooks.ts`'s mount effect
 * calling `port.getPresentation()`, which hit `GET /api/admin/v1/workspaces/:id/presentation`).
 *
 * ## Root cause (not a backend bug)
 *
 * The hang is not in `src/server/inbound/admin-http/routes/presentation/get.ts`, `dev-auth.ts`, or any repo
 * (all confirmed synchronous-under-`better-sqlite3`, single shared connection, no lock/pool to
 * exhaust — see the investigation note this fix's handoff links). It is a browser-level resource
 * exhaustion: `apps/admin/src/lib/settings-events.ts`'s `subscribeToSettingsChanges`, mounted once
 * per open admin tab by `App.hooks.tsx`, opens an `EventSource` to `.../settings/events` that is
 * "deliberately not closed" (that file's own comment) for the tab's entire lifetime. Vite's dev
 * server (and this repo's production server) speak plain HTTP/1.1, and Chrome caps concurrent
 * connections to one origin at 6. Enough long-lived tabs/streams against the same origin — verified
 * live via Playwright by opening several admin tabs against `:5173` until a brand-new tab's own
 * `domcontentloaded` never fired even after 60s — permanently claims every socket, so any OTHER
 * request to that origin (this screen's `getPresentation()` call among them) has no free connection
 * and queues in the browser forever: the server never receives it (idle CPU, matching what was
 * observed live), and nothing ever rejects it (no error, matching what was observed live).
 *
 * ## What this test reproduces, and why not literally 6 real tabs
 *
 * Six real tabs each loading the full admin SPA is slow and adds noise unrelated to the mechanism
 * itself (bundle parse time, React mount time, per-tab login race). The actual mechanism is just
 * "N long-lived connections already held against this origin" — reproduced directly and
 * deterministically by opening six extra raw `EventSource` connections to the very same
 * `/settings/events` endpoint from inside the one already-logged-in tab (which already holds a
 * seventh, the tab's own real one from `App.hooks.tsx`), then triggering the real Themes navigation
 * and observing what the real app does. This is the same origin, the same endpoint, the same
 * "never closes" connection shape as the real bug — not a mock of the mechanism, a smaller-footprint
 * instance of it.
 *
 * ## The fix (what turns this from a hang into a visible failure)
 *
 * `apps/admin/src/lib/api.ts`'s `fetchOrThrowUnreachable` — the one fetch seam every `api.*` call
 * goes through — now races every request against `AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS)`
 * when the caller supplies no signal of its own, and turns a fired timeout into a normal `ApiError`
 * (`code: "REQUEST_TIMEOUT"`) rather than letting a raw `TimeoutError` escape. `useThemes`'s existing
 * `.catch((e) => setError(...))` already turns any rejection into the `error` state, and `Themes.tsx`
 * already prefers `error` over the loading copy once `settings` is still `null` (`if (!settings) return
 * error ? <error notice> : <loading notice>`) — both pre-existing, unchanged by this fix. The only
 * change is that the promise now actually settles.
 *
 * ## Why this waits out the real timeout instead of mocking `page.route`
 *
 * `admin-session-expiry-kickback.spec.ts` mocks one response because the thing under test is what the
 * app does with a response it already received. Here the thing under test is exactly the opposite:
 * what the app does with a request that receives NO response at all within its socket's queue — which
 * `page.route` cannot simulate (a fulfilled/aborted route still resolves the request; the real bug is
 * the browser never dispatching it in the first place). A real, bounded wait is therefore the actual
 * regression signal, not a shortcut being avoided — see `playwright.themes-presentation-timeout
 * .config.ts`'s own header for the resulting `timeout: 60_000`.
 *
 * Before this fix: `.notice.error` never appears (the fetch never settles), so the
 * `toBeVisible({ timeout: 75_000 })` assertion below times out and the test fails with a clear
 * Playwright timeout error — confirmed live against the pre-fix code.
 */

const WORKSPACE_ID = "workspace-local";
const SETTINGS_EVENTS_URL = `/api/admin/v1/workspaces/${WORKSPACE_ID}/settings/events`;
/** Extra long-lived connections opened on top of the tab's own real one (`App.hooks.tsx`), enough to
 *  push the origin's total held connections past Chrome's 6-per-origin HTTP/1.1 cap regardless of
 *  exact browser accounting. */
const EXTRA_HELD_CONNECTIONS = 6;

test.describe("Themes screen survives an exhausted per-origin connection pool", () => {
  test("getPresentation() fails visibly instead of hanging forever when no socket is free", async ({ page }) => {
    await loginAsAdmin(page);
    const network = await page.context().newCDPSession(page);
    await network.send("Network.enable");
    const protocols: string[] = [];
    network.on("Network.responseReceived", (event) => {
      if (new URL(event.response.url).pathname === SETTINGS_EVENTS_URL) {
        const protocol = event.response.protocol;
        if (protocol === undefined) throw new Error("Settings event stream response did not report its protocol");
        protocols.push(protocol);
      }
    });

    // Claim extra sockets against this same origin the same way the real bug's tabs did: long-lived
    // EventSource connections that never close. Fired from inside the page, not `page.route`, so the
    // browser's own real per-origin connection accounting is what gets exercised.
    await page.evaluate(
      ({ url, count }) => {
        const win = window as unknown as { __regressionSockets?: EventSource[] };
        win.__regressionSockets = Array.from(
          { length: count },
          () => new EventSource(url, { withCredentials: true })
        );
      },
      { url: SETTINGS_EVENTS_URL, count: EXTRA_HELD_CONNECTIONS }
    );
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { __regressionSockets: EventSource[] }).__regressionSockets.filter((socket) => socket.readyState === EventSource.OPEN).length
    ), { timeout: 15_000 }).toBeGreaterThan(0);
    expect(protocols.length).toBeGreaterThan(0);
    expect(protocols.every((protocol) => protocol === "http/1.1")).toBe(true);
    // The shell holds more than one stream now. Prove exhaustion with the real queued request,
    // rather than assuming five of our extra streams must fit alongside the shell's connections.
    await expect.poll(() => page.evaluate(async () => {
      try {
        await fetch("/api/admin/v1/workspaces/workspace-local/presentation", { signal: AbortSignal.timeout(2_000) });
        return "responded";
      } catch (error) { return (error as Error).name; }
    }), { timeout: 15_000, message: "presentation must be blocked by the occupied pool before navigation" }).toBe("TimeoutError");
    await network.detach();

    const themesNavLink = page.locator("nav").first().getByRole("link", { name: "Themes", exact: true });
    await themesNavLink.click();

    const errorNotice = page.locator(".notice.error");
    await expect(errorNotice).toBeVisible({ timeout: 75_000 });
    await expect(errorNotice).toContainText(/did not respond|timed out/i);

    // The loading copy must have been replaced, not merely coexisting with an unrelated error.
    await expect(page.getByText("Loading themes…")).toHaveCount(0);
  });
});
});
