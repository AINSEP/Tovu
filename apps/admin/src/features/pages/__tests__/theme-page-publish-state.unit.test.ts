import { describe, expect, it } from "vitest";

import type { ThemePageRow } from "../hooks/use-theme-pages.hooks";
import {
  homeFallbackPublishReason,
  themePageCollisionMessage,
  themePagePath,
  themePagePublicLinkState,
  themePagePublishState,
} from "../lib/theme-page-publish-state";

/**
 * @file Direct branch coverage for {@link themePagePublicLinkState} — the public-site URL column's
 * own state derivation (`ThemePagesTab.tsx`'s PART 1 pass, 2026-08-31 owed-work session). Asserted
 * here as a plain function call rather than only through a render + table lookup: the three cases
 * that column has to get right (`index` is live at `/`, `404`/a template shell have no address at
 * all, an ordinary candidate's address exists but 404s until published) are exactly the branches of
 * this one function, so pinning them here is the direct, combinatorial-effort-free seam —
 * `Pages.unit.test.tsx`'s own "URL column" describe block then only has to prove this state is
 * wired into the right DOM shape, not re-derive the branch logic through a render each time.
 */

const identityT = (key: string): string => key;

function row(overrides: Partial<ThemePageRow> = {}): ThemePageRow {
  return {
    pageId: "about",
    filePath: "render/pages/about.html",
    published: false,
    resettable: true,
    collidingContent: null,
    ...overrides,
  };
}

describe("themePagePublicLinkState", () => {
  it("reports index as live at '/' — the one locked row with a real public address", () => {
    expect(themePagePublicLinkState(row({ pageId: "index", published: null }), identityT)).toEqual({
      kind: "live",
      path: "/",
    });
  });

  it("reports index as replaced — NOT live at '/' — when a content page is the home page", () => {
    const home = { id: "page-home", slug: "/", title: "Home", kind: "page" as const };
    expect(themePagePublicLinkState(row({ pageId: "index", published: null, collidingContent: home }), identityT)).toEqual({
      kind: "replaced",
      reason: "Not shown — {title} is your home page".replace("{title}", "Home"),
    });
  });

  it("reports 404 as having no address at all, not a link that happens to 404", () => {
    expect(themePagePublicLinkState(row({ pageId: "404", published: null }), identityT)).toEqual({ kind: "none" });
  });

  it("reports a declared template shell as having no address at all", () => {
    expect(themePagePublicLinkState(row({ pageId: "blog-post", published: null }), identityT)).toEqual({
      kind: "none",
    });
  });

  it("reports an unpublished candidate page as not-live, at its real (currently 404ing) address", () => {
    expect(themePagePublicLinkState(row({ pageId: "about", published: false }), identityT)).toEqual({
      kind: "not-live",
      path: "/about",
    });
  });

  it("reports a published candidate page as live, at its real address", () => {
    expect(themePagePublicLinkState(row({ pageId: "pricing", published: true }), identityT)).toEqual({
      kind: "live",
      path: "/pricing",
    });
  });
});

describe("themePagePath", () => {
  // Exercised directly, not only through `themePagePublicLinkState` — that caller's own `index`
  // check short-circuits before this function is ever reached with `"index"` (see this function's
  // own doc: the id `theme.pages` uses internally is not the id the site actually routes it at), so
  // its `"index"` branch has no path through the one production call site at all.
  it("maps 'index' to the root path, not '/index'", () => {
    expect(themePagePath("index")).toBe("/");
  });

  it("maps any other page id to its own leading-slash path", () => {
    expect(themePagePath("about")).toBe("/about");
  });
});

/**
 * The theme's `index` is the home FALLBACK, not a page that owns `/` (owner, 2026-10-08). `GET /`
 * serves a Page at the root slug ahead of it, which the detail route reports as `index`'s
 * `collidingContent` — these pin how that fact reads in the Theme Pages tab.
 */
describe("homeFallbackPublishReason", () => {
  it("is locked ON as the fallback while no page is the home page", () => {
    expect(homeFallbackPublishReason(null, identityT)).toEqual({
      on: true,
      reason: "Home page fallback — shown at / until one of your pages is set as the home page",
    });
  });

  it("is locked OFF, naming the page that replaced it, once a page is the home page", () => {
    expect(homeFallbackPublishReason({ id: "p", slug: "/", title: "Home", kind: "page" }, identityT)).toEqual({
      on: false,
      reason: "Not shown — Home is your home page",
    });
  });
});

describe("themePagePublishState — index", () => {
  it("reads index's lock from its collidingContent, not a fixed 'always published'", () => {
    const home = { id: "p", slug: "/", title: "Home", kind: "page" as const };
    expect(themePagePublishState(row({ pageId: "index", published: null, collidingContent: home }), identityT)).toEqual({
      kind: "locked",
      on: false,
      reason: "Not shown — Home is your home page",
    });
    expect(themePagePublishState(row({ pageId: "index", published: null }), identityT)).toEqual({
      kind: "locked",
      on: true,
      reason: "Home page fallback — shown at / until one of your pages is set as the home page",
    });
  });
});

describe("themePageCollisionMessage", () => {
  it("states plainly that a home page at '/' always wins over the theme's index", () => {
    expect(themePageCollisionMessage({ id: "p", slug: "/", title: "Home", kind: "page" }, identityT)).toBe(
      "Home is this site's home page, so visitors see it at / instead of this theme page. This theme page is only shown when no page is set as the home page."
    );
  });

  it("keeps the non-committal wording for an ordinary slug collision", () => {
    expect(themePageCollisionMessage({ id: "p", slug: "about", title: "About", kind: "page" }, identityT)).toBe(
      "A content record shares this page's URL: About. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone."
    );
  });
});
