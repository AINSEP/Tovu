import { renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import {
  themePageCollisionAdminPath,
  themePagePublishSummary,
  useWiredThemePages,
} from "../hooks/use-theme-pages.hooks";
import type { ThemePageRow } from "@jini-ai/admin/pages/hooks/use-theme-pages.hooks";
import type { ThemePagesFileEntry } from "@jini-ai/admin/pages/hooks/theme-pages-port.hooks";

/**
 * @file `useThemePages` — the "Theme Pages" tab's data load.
 *
 * 2026-08-30 (deep-link/publish-toggle pass): rewritten alongside the port/dependencies change —
 * this hook used to expose a bare `pageIds: string[]` off one `getPresentation()` call; it now
 * chains into `getThemeDetail(activeThemeId)` for per-row publish/reset state, so the controller
 * shape changed from `pageIds` to `pages: ThemePageRow[]`. Confirmed RED against the pre-existing
 * version of this file (13 failures) before this rewrite — see the handoff for the verbatim run.
 */

const ABOUT: ThemePagesFileEntry = { path: "render/pages/about.html", group: "page", published: false, resettable: true };
const A_STYLE: ThemePagesFileEntry = { path: "css/theme.css", group: "style", published: null, resettable: true };

describe("useWiredThemePages", () => {
  it("composes the real port and resolves its chained fetches", async () => {
    const base = "/api/admin/v1/workspaces/workspace-local";
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${base}/presentation`) {
        return Promise.resolve(new Response(JSON.stringify({ settings: { activeThemeId: "storefront" } })));
      }
      if (url === `${base}/themes/storefront`) {
        return Promise.resolve(new Response(JSON.stringify({ files: [ABOUT, A_STYLE] })));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { result } = renderHook(() => useWiredThemePages());
      expect(result.current.pages).toBeNull();
      expect(result.current.activeThemeId).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.savingPageId).toBeNull();

      await waitFor(() => expect(result.current.pages).toEqual([
        { pageId: "about", filePath: ABOUT.path, published: false, resettable: true, collidingContent: null },
      ]));
      expect(result.current.activeThemeId).toBe("storefront");
      expect(result.current.error).toBeNull();
      expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
        `${base}/presentation`, `${base}/themes/storefront`,
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

});

// `themePageCollisionAdminPath`/`themePagePublishSummary` used to be top-level functions inline in
// `ThemePageDetailsModal.tsx`, reachable only through a full component render (no direct test
// existed). Moved here (2026-09-03 relocation pass, moving derived-logic computations out of `.tsx`
// files and into their hooks) alongside the rest of this file's row derivations.
describe("themePageCollisionAdminPath", () => {
  // readable-slugs S6a: a post collision now routes by slug, matching pageAdminPath's own
  // slug-preferring convention below.
  it("routes a colliding Post to /posts/:slug", () => {
    expect(themePageCollisionAdminPath({ id: "post-1", slug: "about", title: "About Us", kind: "post" })).toBe(
      "/posts/about",
    );
  });

  it("routes a colliding Page to /pages/:slug", () => {
    expect(themePageCollisionAdminPath({ id: "page-1", slug: "about", title: "About Us", kind: "page" })).toBe(
      "/pages/about",
    );
  });

  // 2026-09-03 consolidation pass: this now delegates to `pageAdminPath` (`rules.ts`), which uses
  // the `home` alias for the one Page a slug can never express as a path segment — the literal root
  // slug `"/"`. Must FAIL if that regresses back to a bare `/pages/${slug}` template.
  it("routes a colliding Page holding the root slug '/' to /pages/home, not /pages//", () => {
    expect(themePageCollisionAdminPath({ id: "home-1", slug: "/", title: "Home", kind: "page" })).toBe(
      "/pages/home",
    );
  });
});

describe("themePagePublishSummary", () => {
  const row = (overrides: Partial<ThemePageRow> = {}): ThemePageRow => ({
    pageId: "about",
    filePath: "render/pages/about.html",
    published: false,
    resettable: true,
    collidingContent: null,
    ...overrides,
  });
  const t = (key: string) => key;

  it("reports 'Live' for a published candidate page", () => {
    expect(themePagePublishSummary({ row: row({ published: true }), t })).toBe("Live");
  });

  it("reports 'Not live' for an unpublished candidate page", () => {
    expect(themePagePublishSummary({ row: row({ published: false }), t })).toBe("Not live");
  });

  it("reports the locked reason for index, verbatim", () => {
    expect(themePagePublishSummary({ row: row({ pageId: "index", published: null }), t })).toBe(
      "Home page fallback — shown at / until one of your pages is set as the home page",
    );
  });

  it("reports the locked reason for a declared template shell", () => {
    expect(themePagePublishSummary({ row: row({ pageId: "blog-post", published: null }), t })).toBe(
      "Not a standalone page — used as a content template",
    );
  });
});
