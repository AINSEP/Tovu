import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file The two CSS declarations `admin.show_site_page`'s "the overlay cannot cover the assistant
 * dock" argument actually rests on (review pass, 2026-09-15).
 *
 * That argument is geometric, not arithmetic: `.site-preview-overlay` is `position: absolute;
 * inset: 0`, and its containing block is `.admin-main-col` — a column whose box excludes the dock's
 * separate flex column entirely. That is why the commit needed no z-index reasoning against the
 * dock, and why `app-admin-assistant-dock-visibility.unit.test.tsx` can assert the DOM half of it.
 *
 * But the whole thing hinges on ONE declaration: `position: relative` on `.admin-main-col`, added by
 * that same commit. `.admin-main-col` was static before it. Delete it and `absolute`'s containing
 * block silently becomes the initial containing block — the viewport — at which point the overlay
 * paints over the dock, which is `position: static` at desktop widths and therefore loses to ANY
 * positioned box regardless of z-index (CSS2.1 Appendix E). Nothing about that failure is visible in
 * jsdom, which performs no layout, so no component test can catch it; it is exactly the class of
 * pure-CSS invariant `narrow-content-column-css.unit.test.ts` and `sidebar-accordion-css.unit.test.ts`
 * assert as stylesheet text for the same reason.
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("site-preview overlay containment", () => {
  it("keeps .admin-main-col positioned — it is the overlay's containing block, and was static before this feature", () => {
    const rule = /\.admin-main-col\s*\{[^}]*\}/.exec(stylesheet)?.[0] ?? "";
    expect(rule).not.toBe("");
    expect(rule).toMatch(/position\s*:\s*relative/);
  });

  it("keeps .site-preview-overlay confined to that box — absolute+inset, never fixed", () => {
    const rule = /\.site-preview-overlay\s*\{[^}]*\}/.exec(stylesheet)?.[0] ?? "";
    expect(rule).not.toBe("");
    expect(rule).toMatch(/position\s*:\s*absolute/);
    expect(rule).toMatch(/inset\s*:\s*0/);
    // `position: fixed` would escape `.admin-main-col` entirely and paint over the dock — the one
    // substitution that looks equivalent in a diff and is not.
    expect(rule).not.toMatch(/position\s*:\s*fixed/);
  });
});
