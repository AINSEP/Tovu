import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Regression test for the admin shell's phantom vertical document scroll, found live (owner
 * UI/UX pass on the Deployment panel, 2026-08-15): *"there's a scroll issue here where if I go down
 * there's a bunch of white space."*
 *
 * ## The defect
 *
 * `.admin-layout` is `height: 100vh; overflow: hidden` and `.admin-content` is the real scroller
 * (`overflow-y: auto`), so the DOCUMENT itself must never scroll — every screen in this admin is a
 * fixed-viewport shell with two independent internal scrollers (the sidebar `.cms-nav` and the
 * content `main`). It scrolled anyway: 341px of blank page below a layout that ends at the viewport
 * edge, with the sidebar's own divider visibly stopping partway up the white area.
 *
 * The cause was `.visually-hidden` (`styles.css`, ONE global rule, 22 uses across 8 components).
 * It was `position: absolute` with NO `top`/`left`, so its offsets resolved against its static
 * position — measured inside its containing block, which is whatever ancestor is positioned. For
 * `.tab-bar-item` (a plain `<button>`, `position: static`) that is the initial containing block,
 * i.e. the document. `TabBar.tsx`'s accessible ", Connected" suffix on a connected publish-target
 * tab therefore computed `top: 1049.67px` and stretched `document.scrollHeight` to 1050px.
 *
 * Critically, `.admin-content`'s `overflow-y: auto` could NOT clip it: a static ancestor is not a
 * containing block, so the span was never inside that scroll box in the first place. That is why
 * the obvious fix — locking `html`/`body` with `overflow: hidden` — was measured and does NOT work
 * here (document scroll stayed at 341px). The fix is `top: 0; left: 0` on `.visually-hidden`,
 * pinning it to its containing block's origin instead of its static position.
 *
 * ## Why the probe is injected rather than driven through the real UI
 *
 * The production trigger is a publish target with a SAVED credential — only then does `TabBar`
 * render a `dot` and its ", Connected" suffix. This config boots a hermetic `TOVU_DB=memory`
 * server, so no credential exists and no such span is ever rendered.
 *
 * That is not a detail to paper over: an earlier revision of this file asserted only
 * `maxDocumentScrollY === 0` on the real page and passed **with the fix reverted**, because the
 * element that causes the bug was not on screen at all. A green result there measured "this
 * hermetic database has no saved credentials", not "the shell contains its overflow".
 *
 * So the first test injects the exact DOM shape instead: a `.visually-hidden` span whose ancestor
 * chain is entirely `position: static`, placed at the bottom of the tall content flow. That is the
 * same geometry `.tab-bar-item` produces, it depends on no seeded state, and it is verified to fail
 * against the unfixed rule and pass against the fixed one.
 *
 * jsdom has no layout engine, so `scrollHeight`/`clientHeight` are meaningless there and no unit
 * test at any level can observe any of this. The config pins a 1440x720 viewport — SHORTER than
 * the page content — because the bug is only reachable when the content actually overflows.
 *
 * No `waitForLoadState("networkidle")` anywhere here — confirmed live (project memory) that it
 * never resolves against this admin app. Every wait is an explicit element/state wait instead.
 */

const PROBE_ID = "vh-document-scroll-probe";

/** The shell's own contract, asserted directly: `.admin-layout` is `height: 100vh; overflow:
 *  hidden`, so the document has nothing to scroll. Reads the max scroll the browser will actually
 *  honour rather than comparing `scrollHeight` to `clientHeight` — an element can report a taller
 *  scrollHeight than it lets you reach, and what the owner saw was real reachable blank space, so
 *  the assertion should measure the thing they experienced. */
async function maxDocumentScrollY(page: Page): Promise<number> {
  return page.evaluate(() => {
    const before = window.scrollY;
    window.scrollTo(0, 1_000_000);
    const max = window.scrollY;
    window.scrollTo(0, before);
    return max;
  });
}

/**
 * Appends a `.visually-hidden` span at the bottom of the content scroller, inside a wrapper that is
 * `position: static` — reproducing `.tab-bar-item`'s geometry exactly.
 *
 * Appended to `.admin-content` itself rather than nested inside a card: `.card` and several of its
 * children are `position: relative`, which would give the span a containing block INSIDE the scroll
 * box and mask the very bug under test. `.admin-content` is static, so the span's containing block
 * resolves to the initial containing block — the condition that makes it escape the scroller.
 *
 * Returns the probe's static-position offset so the caller can assert the setup actually put it
 * below the fold; a probe that lands inside the first viewport proves nothing either way.
 */
async function injectVisuallyHiddenProbe(page: Page, probeId: string): Promise<number> {
  return page.evaluate((id) => {
    const content = document.querySelector(".admin-content");
    if (!content) throw new Error(".admin-content not found — the admin shell did not render");
    const host = document.createElement("div");
    host.id = id;
    const span = document.createElement("span");
    span.className = "visually-hidden";
    span.textContent = ", Connected";
    host.appendChild(span);
    content.appendChild(host);
    return Math.round(host.getBoundingClientRect().top + window.scrollY);
  }, probeId);
}

test.describe("the admin shell never scrolls the document itself", () => {
  test("a screen-reader-only span low in the content flow does not stretch the document", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/deployment?tab=static-site");
    await expect(page.locator(".admin-content .card").first()).toBeVisible();

    // Precondition: the page is genuinely taller than the viewport, so the probe's static position
    // lands below the fold and the assertion below has something real to catch.
    const viewportHeight = page.viewportSize()?.height ?? 0;
    const probeTop = await injectVisuallyHiddenProbe(page, PROBE_ID);
    expect(probeTop).toBeGreaterThan(viewportHeight);

    // The whole point: that span sits ~1900px down the content flow, and the document must still
    // refuse to scroll. Pre-fix this is the 341px of white space the owner reported.
    expect(await maxDocumentScrollY(page)).toBe(0);
  });

  test("no .visually-hidden element resolves to a position below the viewport", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/deployment?tab=static-site");
    await expect(page.locator(".admin-content .card").first()).toBeVisible();
    await injectVisuallyHiddenProbe(page, PROBE_ID);

    // The mechanism itself, asserted directly rather than only through its symptom: a
    // screen-reader-only box that resolves its offsets against the document can push the page
    // taller no matter which screen it appears on. Pinned to its containing block's origin, its
    // document-space bottom can never exceed the viewport.
    const worst = await page.evaluate(() => {
      const vh = document.documentElement.clientHeight;
      let max = 0;
      for (const el of document.querySelectorAll(".visually-hidden")) {
        const r = el.getBoundingClientRect();
        max = Math.max(max, r.bottom + window.scrollY);
      }
      return { max, vh };
    });
    expect(worst.max).toBeLessThanOrEqual(worst.vh);
  });

  test("the fix does not disable either real scroller", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/deployment?tab=static-site");
    await expect(page.locator(".admin-content .card").first()).toBeVisible();

    // Guards the obvious wrong fix. "Stop the document scrolling" is trivially satisfiable by
    // clamping the shell until nothing scrolls at all — which would make the sidebar's lower nav
    // items and the bottom of every long page permanently unreachable. Both internal scrollers must
    // still overflow their own boxes.
    const scrollers = await page.evaluate(() => {
      const content = document.querySelector(".admin-content");
      const nav = document.querySelector(".cms-nav");
      return {
        contentOverflows: !!content && content.scrollHeight > content.clientHeight + 1,
        navOverflows: !!nav && nav.scrollHeight > nav.clientHeight + 1,
      };
    });
    expect(scrollers.contentOverflows).toBe(true);
    expect(scrollers.navOverflows).toBe(true);
  });

  test("Themes: the shared TabBar screen holds the same contract", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/themes");
    await expect(page.locator(".admin-content").first()).toBeVisible();
    await expect(page.locator(".tab-bar").first()).toBeVisible();

    await injectVisuallyHiddenProbe(page, PROBE_ID);
    expect(await maxDocumentScrollY(page)).toBe(0);
  });
});
