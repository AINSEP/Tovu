import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createFakeThemePagesPort } from "../hooks/theme-pages-dependencies.hooks";
import {
  themePageCollisionAdminPath,
  themePagePublishSummary,
  useThemePages,
  useWiredThemePages,
  type ThemePageRow,
} from "../hooks/use-theme-pages.hooks";
import type { ThemePagesFileEntry } from "../hooks/theme-pages-port.hooks";

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
const PRICING: ThemePagesFileEntry = { path: "render/pages/pricing.html", group: "page", published: true, resettable: true };
const INDEX: ThemePagesFileEntry = { path: "render/pages/index.html", group: "page", published: null, resettable: true };
const A_STYLE: ThemePagesFileEntry = { path: "css/theme.css", group: "style", published: null, resettable: true };
const COLLISION = { id: "post-1", slug: "about", title: "About Us", kind: "post" as const };
const ABOUT_WITH_COLLISION: ThemePagesFileEntry = { ...ABOUT, collidingContent: COLLISION };

describe("useThemePages", () => {
  it("resolves theme detail's page-group files into rows, without touching fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const port = createFakeThemePagesPort({ pageFiles: [ABOUT, PRICING] });
      const { result } = renderHook(() => useThemePages(port));
      await waitFor(() => expect(result.current.pages).not.toBeNull());
      expect(result.current.pages).toEqual([
        { pageId: "about", filePath: "render/pages/about.html", published: false, resettable: true, collidingContent: null },
        { pageId: "pricing", filePath: "render/pages/pricing.html", published: true, resettable: true, collidingContent: null },
      ]);
      expect(result.current.error).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("drops non-'page'-group files from the row list", async () => {
    const port = createFakeThemePagesPort({ pageFiles: [ABOUT, A_STYLE] });
    const { result } = renderHook(() => useThemePages(port));
    await waitFor(() => expect(result.current.pages).not.toBeNull());
    expect(result.current.pages).toEqual([
      { pageId: "about", filePath: "render/pages/about.html", published: false, resettable: true, collidingContent: null },
    ]);
  });

  /**
   * 2026-08-31 pass: the Theme Pages tab's details modal shows any live content record already
   * claiming a page's slug — the same fact Theme Studio's Explore screen warns about
   * (`ThemeExploreSlugCollisionWarning`). `getThemeDetail`'s own `collidingContent` now flows
   * straight through into the row, same `?? null` normalization `published` already gets.
   */
  it("carries a file's collidingContent straight into its row, defaulting to null when absent", async () => {
    const port = createFakeThemePagesPort({ pageFiles: [ABOUT_WITH_COLLISION, PRICING] });
    const { result } = renderHook(() => useThemePages(port));
    await waitFor(() => expect(result.current.pages).not.toBeNull());
    expect(result.current.pages?.find((p) => p.pageId === "about")?.collidingContent).toEqual(COLLISION);
    expect(result.current.pages?.find((p) => p.pageId === "pricing")?.collidingContent).toBeNull();
  });

  it("keeps a null `published` for a page the publish question doesn't apply to (index/404/a template shell)", async () => {
    const port = createFakeThemePagesPort({ pageFiles: [INDEX] });
    const { result } = renderHook(() => useThemePages(port));
    await waitFor(() => expect(result.current.pages).not.toBeNull());
    expect(result.current.pages?.[0]?.published).toBeNull();
  });

  /**
   * The Theme Pages tab's URL cell links into the theme studio (`?theme=&page=`), and every publish
   * call needs a theme id too, so this hook still exposes the ACTIVE theme id from the same
   * `getPresentation()` response it always has.
   */
  it("also exposes the active theme id from the presentation response", async () => {
    const port = createFakeThemePagesPort({ activeThemeId: "storefront", pageFiles: [INDEX] });
    const { result } = renderHook(() => useThemePages(port));
    await waitFor(() => expect(result.current.pages).not.toBeNull());
    expect(result.current.activeThemeId).toBe("storefront");
  });

  it("leaves activeThemeId null until the load settles, so no link/publish call can be built from a half-loaded state", async () => {
    const port = createFakeThemePagesPort({ activeThemeId: "basic", pageFiles: [] });
    const { result } = renderHook(() => useThemePages(port));
    expect(result.current.activeThemeId).toBeNull();
    await waitFor(() => expect(result.current.activeThemeId).toBe("basic"));
  });

  it("resolves to [] (not an error) when the active theme ships no pages", async () => {
    const port = createFakeThemePagesPort({ pageFiles: [] });
    const { result } = renderHook(() => useThemePages(port));
    await waitFor(() => expect(result.current.pages).not.toBeNull());
    expect(result.current.pages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("sets the fallback error when getPresentation rejects", async () => {
    const port = createFakeThemePagesPort({ getPresentationError: new Error("boom") });
    const { result } = renderHook(() => useThemePages(port));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("boom");
    expect(result.current.pages).toBeNull();
  });

  it("sets the fallback error when the second, chained getThemeDetail call rejects", async () => {
    const port = createFakeThemePagesPort({ getThemeDetailError: new Error("detail boom") });
    const { result } = renderHook(() => useThemePages(port));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("detail boom");
    expect(result.current.pages).toBeNull();
    // The first leg of the chain still resolved — proves this is a genuine two-request chain, not
    // one request whose failure happens to look the same.
    expect(result.current.activeThemeId).toBe("basic");
  });

  it("useWiredThemePages composes the real port — same controller shape before the real fetch settles", () => {
    const { result } = renderHook(() => useWiredThemePages());
    expect(result.current.pages).toBeNull();
    expect(result.current.activeThemeId).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.savingPageId).toBeNull();
  });

  describe("setPagePublished", () => {
    it("publishes a row and updates it in place, tracking savingPageId only for that row", async () => {
      const port = createFakeThemePagesPort({ activeThemeId: "basic", pageFiles: [ABOUT, PRICING] });
      const { result } = renderHook(() => useThemePages(port));
      await waitFor(() => expect(result.current.pages).not.toBeNull());

      let settled: Promise<void> = Promise.resolve();
      act(() => {
        settled = result.current.setPagePublished("about", true);
      });
      // Only the row being saved reports it — `pricing` is untouched and not "saving" too.
      await waitFor(() => expect(result.current.savingPageId).toBe("about"));
      await act(() => settled);

      expect(result.current.savingPageId).toBeNull();
      expect(result.current.pages?.find((p) => p.pageId === "about")?.published).toBe(true);
      expect(result.current.pages?.find((p) => p.pageId === "pricing")?.published).toBe(true);
    });

    it("is a no-op — no port call, no state change — before activeThemeId has resolved", async () => {
      const port = createFakeThemePagesPort({ pageFiles: [ABOUT] });
      const setPagePublishedSpy = vi.spyOn(port, "setPagePublished");
      const { result } = renderHook(() => useThemePages(port));
      // Deliberately not awaited past this point — activeThemeId is still null.
      await act(() => result.current.setPagePublished("about", true));
      expect(setPagePublishedSpy).not.toHaveBeenCalled();
    });

    it("sets the fallback error, and clears savingPageId, when the port rejects", async () => {
      const port = createFakeThemePagesPort({
        activeThemeId: "basic",
        pageFiles: [ABOUT],
        setPagePublishedError: new Error("publish boom"),
      });
      const { result } = renderHook(() => useThemePages(port));
      await waitFor(() => expect(result.current.pages).not.toBeNull());
      await act(() => result.current.setPagePublished("about", true));
      expect(result.current.error).toBe("publish boom");
      expect(result.current.savingPageId).toBeNull();
      // The row's own state is untouched by a failed call.
      expect(result.current.pages?.find((p) => p.pageId === "about")?.published).toBe(false);
    });
  });
});

// `themePageCollisionAdminPath`/`themePagePublishSummary` used to be top-level functions inline in
// `ThemePageDetailsModal.tsx`, reachable only through a full component render (no direct test
// existed). Moved here (2026-09-03 relocation pass, moving derived-logic computations out of `.tsx`
// files and into their hooks) alongside the rest of this file's row derivations.
describe("themePageCollisionAdminPath", () => {
  it("routes a colliding Post to /posts/:id", () => {
    expect(themePageCollisionAdminPath({ id: "post-1", slug: "about", title: "About Us", kind: "post" })).toBe(
      "/posts/post-1",
    );
  });

  it("routes a colliding Page to /pages/:slug", () => {
    expect(themePageCollisionAdminPath({ id: "page-1", slug: "about", title: "About Us", kind: "page" })).toBe(
      "/pages/about",
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
    expect(themePagePublishSummary(row({ published: true }), t)).toBe("Live");
  });

  it("reports 'Not live' for an unpublished candidate page", () => {
    expect(themePagePublishSummary(row({ published: false }), t)).toBe("Not live");
  });

  it("reports the locked reason for index, verbatim", () => {
    expect(themePagePublishSummary(row({ pageId: "index", published: null }), t)).toBe(
      "Always published — theme home page",
    );
  });

  it("reports the locked reason for a declared template shell", () => {
    expect(themePagePublishSummary(row({ pageId: "blog-post", published: null }), t)).toBe(
      "Not a standalone page — used as a content template",
    );
  });
});
