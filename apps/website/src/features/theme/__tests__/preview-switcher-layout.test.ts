/** Owner report 2026-11-04 (recurring): the theme preview tag "ALWAYS has a gap and is left aligned".
 * Root cause: the banner's own shadow `:host{all:initial!important}` beats the host's inline
 * `position:fixed!important` (for !important, the shadow context wins), so the bar fell into page
 * flow below the 44px body padding it reserves — a 44px gap above it — and the bar never centred.
 * Site agents kept patching it per theme (preview-bar-fix.js, zoran's `--tovu-theme-preview-height:
 * 0px!important`, …), so this checks the real browser layout under several unrelated themes,
 * including themes that override the banner's variables. */
import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Page } from "playwright";
import { decoratePreviewPage } from "../preview-switcher-html.js";
import type { PreviewSwitcher } from "../preview-switcher.js";

const three: PreviewSwitcher = { enabled: true, position: "top", themes: [
  { themeId: "agency", label: "Agency" }, { themeId: "runway", label: "Runway" }, { themeId: "editorial", label: "Editorial" }] };
const eight: PreviewSwitcher = { enabled: true, position: "top",
  themes: Array.from({ length: 8 }, (_, i) => ({ themeId: `t${i}`, label: `Long theme name ${i}` })) };

const tall = '<main id="first" style="display:block;height:3000px">Content</main>';
const THEMES: Record<string, string> = {
  // Sticky header in flow (Tovu theme, Xander Estin).
  sticky: `<style>body{margin:0;font:16px serif}header{position:sticky;top:0;height:64px;background:#fff}</style><header id="first">Header</header>${tall}`,
  // Fixed header with the theme's own body padding (Jared Floyd, A26).
  fixed: `<style>body{margin:0;padding-top:72px}header{position:fixed;top:0;left:0;right:0;height:72px;background:#eee}main{display:block}</style><header>Header</header><main id="first" style="height:3000px">Content</main>`,
  // Themes that already shipped workarounds for the old bug and zero the banner's variables.
  hostile: `<style>html{--tovu-theme-preview-height:0px!important}body{--tovu-theme-preview-height:0px;--tovu-theme-preview-base-padding:0px;margin:0;padding-top:0!important;text-align:right}nav,a,span{display:block!important;float:left;margin:9px}</style>${tall}`,
};

function decorated({ body, config }: { body: string; config: PreviewSwitcher }, _options = {}): string {
  return decoratePreviewPage({ html: `<!doctype html><html><head></head><body>${body}</body></html>`, config,
    activeThemeId: config.themes[0]!.themeId, currentThemeId: config.themes[0]!.themeId, path: "/", origin: "https://site.test", preview: false, delivery: "live" });
}

async function open({ page, html, width }: { page: Page; html: string; width: number }, _options = {}): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  await page.route("https://site.test/**", route => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto("https://site.test/");
  await page.unroute("https://site.test/**");
}

/** Geometry of the bar and its controls, in viewport pixels. */
function measure(page: Page, _options = {}) {
  return page.evaluate(() => {
    const host = document.querySelector(".tovu-theme-preview-host") as HTMLElement;
    const bar = host.shadowRoot!.querySelector(".tovu-theme-preview-bar") as HTMLElement;
    const kids = Array.from(bar.children).map(el => el.getBoundingClientRect());
    const hostRect = host.getBoundingClientRect(), barRect = bar.getBoundingClientRect();
    const first = document.getElementById("first")!.getBoundingClientRect();
    return { position: getComputedStyle(host).position, hostTop: hostRect.top, hostBottom: hostRect.bottom, hostWidth: hostRect.width,
      leftGap: kids[0]!.left - barRect.left, rightGap: barRect.right - kids[kids.length - 1]!.right,
      overflows: bar.scrollWidth > bar.clientWidth, firstTop: first.top, viewport: window.innerWidth };
  });
}

for (const [name, body] of Object.entries(THEMES)) {
  for (const width of [1440, 390]) {
    test(`preview tag under the "${name}" theme at ${width}px: pinned at the very top, centred, no gap, nothing hidden under it`, async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await open({ page, html: decorated({ body, config: three }), width });
        const at = await measure(page);
        assert.equal(at.position, "fixed", "the host-owned tag is fixed, never in page flow");
        assert.equal(at.hostTop, 0, "no gap above the tag");
        assert.equal(at.hostWidth, at.viewport, "the tag spans the viewport");
        assert.equal(at.overflows, false);
        assert.ok(Math.abs(at.leftGap - at.rightGap) <= 1, `controls are centred (left ${at.leftGap}px, right ${at.rightGap}px)`);
        if (name !== "fixed") assert.equal(at.firstTop, at.hostBottom, "the page starts right under the tag: no gap, no overlap");
        else assert.ok(at.firstTop >= at.hostBottom, "the theme's own fixed-header padding stays clear of the tag");
        await page.mouse.wheel(0, 600);
        await page.waitForFunction(() => window.scrollY > 0);
        const scrolled = await measure(page);
        assert.equal(scrolled.hostTop, 0, "the tag stays pinned while scrolling");
        if (name === "sticky") assert.equal(scrolled.firstTop, scrolled.hostBottom, "sticky chrome sits flush under the tag");
      } finally {
        await browser.close();
      }
    });
  }
}

test("preview tag with more choices than fit a phone scrolls from the start instead of clipping the label", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await open({ page, html: decorated({ body: THEMES.sticky!, config: eight }), width: 390 });
    const at = await measure(page);
    assert.equal(at.hostTop, 0);
    assert.equal(at.overflows, true);
    assert.ok(at.leftGap >= 0 && at.leftGap <= 16, `safe centring keeps the label reachable (left ${at.leftGap}px)`);
  } finally {
    await browser.close();
  }
});
