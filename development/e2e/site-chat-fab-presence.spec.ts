import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * @file The public site-chat FAB is present, visible, clickable and looks right on every themed page
 * that ships it — and the markup that mounts it is real markup, not text inside an HTML comment.
 *
 * ## The regression this file exists for (2026-09-29)
 *
 * The FAB silently vanished from `/`, `/about` and blog posts. Theme commit `d2b0f234a` put a comment
 * in tovu-theme's `<head>` that named `</body>` literally, and `render.ts#injectSiteAssistantIntoStaticPage`
 * spliced the mount div + `<script>` before the FIRST `</body>` match — inside that comment. Only the
 * `<head>` stylesheet survived, so nothing errored, nothing logged, and every unit test stayed green.
 * Fixed in `1a42dbe02` (render: skip commented matches) and `64c609f06` (theme: comment no longer names
 * the tag). `render.test.ts` pins the splice rule against a synthetic comment; this file pins the
 * outcome a visitor sees on the real server with the real shipped theme, which is the layer that lost it.
 *
 * Three independent checks per page, cheapest first, so a failure names what broke:
 * 1. Served HTML: the mount node and script tag sit outside every comment and before the real `</body>`.
 * 2. Browser: `.chat-fab` inside `#tovu-site-assistant-root` is visible, in the bottom-right corner of
 *    the viewport, and opens the panel when clicked.
 * 3. Visual: a screenshot of the bottom-right corner region against a committed baseline.
 *
 * Runs under `playwright.site-chat-fab.config.ts`, whose `globalSetup` flips the real
 * `site.assistant.public_enabled` switch (the widget is not rendered at all while it is off) and
 * activates `tovu-theme`, the theme `sites/tovu-dev` ships — the in-memory default `tovu-starter`
 * never had the offending comment, which is why the existing site-assistant suite could not see this.
 */

/** The pages the owner reported the FAB missing from, each rendered by a different static template:
 *  `index.html`, `about.html`, `posts-default.html` (seeded post from `seed.ts`). */
const PAGES = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "blog-post", path: "/how-themes-work" },
] as const;

const MOUNT_ID = "tovu-site-assistant-root";
const SCRIPT_SRC = "/site-chat/site-assistant.js";
/** Size of the square corner region screenshotted — the 56px FAB at 24px insets plus margin. */
const CORNER_SIZE = 120;
/** Hides everything but `#${MOUNT_ID}` during the corner capture. Anchored to this file's directory:
 *  a relative `stylePath` resolves against however the suite was invoked. */
const CORNER_SCREENSHOT_CSS = path.resolve(import.meta.dirname, "site-chat-fab-presence.screenshot.css");

/** Half-open `[start, end)` ranges of every `<!-- ... -->` in `html`; an unterminated comment runs to
 *  the end, as the HTML parser treats it. */
function commentRanges(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let start = html.indexOf("<!--"); start !== -1; start = html.indexOf("<!--", start)) {
    const close = html.indexOf("-->", start + 4);
    const end = close === -1 ? html.length : close + 3;
    ranges.push([start, end]);
    start = end;
  }
  return ranges;
}

function isCommented(ranges: Array<[number, number]>, index: number): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/** Every index of `needle` in `html` that is outside a comment. */
function uncommentedIndexes(html: string, needle: string): number[] {
  const ranges = commentRanges(html);
  const found: number[] = [];
  for (let at = html.indexOf(needle); at !== -1; at = html.indexOf(needle, at + 1)) {
    if (!isCommented(ranges, at)) found.push(at);
  }
  return found;
}

async function openAndWaitForMount(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // Not `waitForSelector(".chat-fab")` alone: when the bug recurs there is no FAB and no error, so a
  // bare timeout would say nothing. The assertions below say which layer is missing.
  await expect(page.locator(`#${MOUNT_ID}`), "mount node is in the DOM (not swallowed by a comment)").toHaveCount(1);
}

test.describe("site-chat FAB is present on every public page that ships it", () => {
  for (const { name, path } of PAGES) {
    test(`${name} (${path}): served HTML mounts the assistant outside comments, before the real </body>`, async ({
      request,
    }) => {
      const response = await request.get(path);
      expect(response.status(), `${path} renders`).toBe(200);
      const html = await response.text();
      // Guard the guard: on the in-memory default theme this whole file passes without ever touching
      // the templates that lost the FAB.
      expect(html, `${path} is rendered by tovu-theme`).toContain("/theme-assets/tovu-theme/");

      const mounts = uncommentedIndexes(html, `id="${MOUNT_ID}"`);
      const scripts = uncommentedIndexes(html, `src="${SCRIPT_SRC}"`);
      const bodyCloses = uncommentedIndexes(html.toLowerCase(), "</body>");
      expect(mounts, `uncommented #${MOUNT_ID} in ${path}`).toHaveLength(1);
      expect(scripts, `uncommented ${SCRIPT_SRC} script in ${path}`).toHaveLength(1);
      expect(bodyCloses.length, `uncommented </body> in ${path}`).toBeGreaterThan(0);
      const realBodyClose = bodyCloses[bodyCloses.length - 1]!;
      expect(mounts[0]!, "mount node precedes the real </body>").toBeLessThan(realBodyClose);
      expect(scripts[0]!, "script tag precedes the real </body>").toBeLessThan(realBodyClose);
    });

    test(`${name} (${path}): the FAB is visible in the bottom-right corner and opens the panel`, async ({ page }) => {
      await openAndWaitForMount(page, path);
      const fab = page.locator(`#${MOUNT_ID} .chat-fab`);
      await expect(fab).toBeVisible();
      await expect(fab).toBeInViewport();

      // Derived from the live viewport, never a literal: the config's declared height loses to the
      // Desktop Chrome device preset (see playwright_config_viewport_override).
      const viewport = page.viewportSize()!;
      const box = (await fab.boundingBox())!;
      expect(box.x + box.width, "FAB hugs the right edge").toBeGreaterThan(viewport.width - CORNER_SIZE);
      expect(box.y + box.height, "FAB hugs the bottom edge").toBeGreaterThan(viewport.height - CORNER_SIZE);
      expect(box.width, "FAB is the designed circle, not a bare unstyled button").toBeGreaterThanOrEqual(40);

      await fab.click();
      await expect(page.locator(".tovu-site-assistant__panel")).toBeVisible();
    });

    test(`${name} (${path}): the bottom-right corner matches the FAB baseline`, async ({ page }) => {
      // Reduced motion before navigation: tovu-theme's kUInetic entrances and cloak key off it, so the
      // page content behind the corner is at rest rather than mid-animation.
      await page.emulateMedia({ reducedMotion: "reduce" });
      // No wait on the FAB first: this check must fail on its own pixels when the FAB is missing, not
      // stop at the same precondition the test above already owns. `toHaveScreenshot` retries until
      // the capture matches or its timeout ends, which covers the deferred bundle mounting.
      await page.goto(path, { waitUntil: "domcontentloaded" });

      const viewport = page.viewportSize()!;
      // Everything except the widget is hidden for the capture, so page copy, imagery and late-loading
      // fonts behind the corner cannot move the diff — only the FAB itself (or its absence) can. Not
      // `mask`: a mask box is painted OVER the page, and `<main>`'s box covers the fixed FAB too.
      await expect(page).toHaveScreenshot(`fab-corner-${name}.png`, {
        clip: { x: viewport.width - CORNER_SIZE, y: viewport.height - CORNER_SIZE, width: CORNER_SIZE, height: CORNER_SIZE },
        animations: "disabled",
        caret: "hide",
        stylePath: CORNER_SCREENSHOT_CSS,
      });
    });
  }
});
