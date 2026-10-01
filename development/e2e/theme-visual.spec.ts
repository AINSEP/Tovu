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
    const link = header.locator(".main-nav").getByRole("link", { name, exact: true });
    await expect(link).toHaveCount(1);
    if (!mobile) {
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
  }
  await expect(header.getByRole("link", { name: "Get started", exact: true })).toBeVisible();
}

test.describe("theme visual regression (AW-2)", () => {
  test("download installation command copy writes the displayed command to the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
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
test.describe("AW-1 — mobile nav drawer (basic theme)", () => {
  test("drawer opens flush under the sticky header, no clipped items, closes on toggle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareForScreenshot(page);
    await page.goto("/");
    await waitForFonts(page);

    const header = page.locator(".site-header");
    const toggle = page.locator(".nav-toggle");
    const nav = page.locator(".main-nav");

    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(nav).toHaveClass(/\bopen\b/);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    const headerBox = await header.boundingBox();
    const navBox = await nav.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    // The drawer's top edge must sit at or below the header's bottom edge — an overlap is exactly
    // the "first item clipped behind the header" bug todos.md describes. 1px tolerance for
    // sub-pixel layout rounding.
    expect(navBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);

    // Every collapsed nav link must be fully reachable below the header, not hidden behind it.
    const links = nav.locator("a");
    const linkCount = await links.count();
    expect(linkCount).toBeGreaterThan(0);
    for (let i = 0; i < linkCount; i++) {
      const box = await links.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);
      expect(box!.x).toBeGreaterThanOrEqual(Math.max(0, navBox!.x) - 1);
      expect(box!.y).toBeGreaterThanOrEqual(navBox!.y - 1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(Math.min(390, navBox!.x + navBox!.width) + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(Math.min(844, navBox!.y + navBox!.height) + 1);
    }

    // The CTA lives in `.nav-actions`, a header sibling outside the collapsing drawer — it must
    // stay reachable in the header itself while the drawer is open (todos.md: "all items+CTA
    // reachable"). Scoped to `.nav-actions` because the footer repeats a "Get started" link too.
    await expect(page.locator(".nav-actions").getByRole("link", { name: "Get started" })).toBeVisible();

    // Clip to the drawer's own extent (plus a small margin) rather than a bare `fullPage` shot —
    // AW-2's own baseline already documented that an unclipped mobile shot bleeds the off-canvas
    // drawer's width into `document.documentElement.scrollWidth`.
    await expect(page).toHaveScreenshot("home-mobile-390-drawer-open.png", {
      clip: { x: 0, y: 0, width: 390, height: Math.ceil(navBox!.y + navBox!.height + 24) },
    });

    // Closes on toggle.
    await toggle.click();
    await expect(nav).not.toHaveClass(/\bopen\b/);
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
