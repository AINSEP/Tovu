import { describe, expect, it } from "vitest";

import type { ThemePageRow } from "../hooks/use-theme-pages.hooks";
import { themePagePath, themePagePublicLinkState } from "../lib/theme-page-publish-state";

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
