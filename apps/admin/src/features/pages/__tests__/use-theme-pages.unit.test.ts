import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createFakeThemePagesPort } from "../hooks/theme-pages-dependencies.hooks";
import { useThemePages, useWiredThemePages } from "../hooks/use-theme-pages.hooks";

/**
 * @file `useThemePages` — the "Theme Pages" tab's data load. New coverage added alongside the
 * `useWiredX` conversion (`theme-pages-port.hooks.ts` / `theme-pages-dependencies.hooks.ts`) —
 * there was no hook-level test for this file before (`Pages.unit.test.tsx` only exercises it
 * through the pre-existing `useThemePagesHook` DI-prop seam with a fake controller, never the real
 * hook body). This proves the pure hook is independently testable against an injected port.
 */

describe("useThemePages", () => {
  it("resolves activeThemeStaticPageIds from the injected port, without touching fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const port = createFakeThemePagesPort({ activeThemeStaticPageIds: ["about.html", "contact.html"] });
      const { result } = renderHook(() => useThemePages(port));
      await waitFor(() => expect(result.current.pageIds).not.toBeNull());
      expect(result.current.pageIds).toEqual(["about.html", "contact.html"]);
      expect(result.current.error).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * The Theme Pages tab's URL cell links into the theme studio (`?theme=&page=`), so it needs the
   * ACTIVE theme id as well as the page ids. Both ride on the one `getPresentation()` response this
   * hook already fetches — `settings.activeThemeId` is the same field `activeThemeStaticPageIds` was
   * computed from server-side (`presentation/get.ts`) — so this is a second field off an existing
   * round trip, not a second data source.
   */
  it("also exposes the active theme id from the same presentation response", async () => {
    const port = createFakeThemePagesPort({ activeThemeId: "storefront", activeThemeStaticPageIds: ["404"] });
    const { result } = renderHook(() => useThemePages(port));
    await waitFor(() => expect(result.current.pageIds).not.toBeNull());
    expect(result.current.activeThemeId).toBe("storefront");
  });

  it("leaves activeThemeId null until the load settles, so no link can be built from a half-loaded state", async () => {
    const port = createFakeThemePagesPort({ activeThemeId: "basic" });
    const { result } = renderHook(() => useThemePages(port));
    expect(result.current.activeThemeId).toBeNull();
    await waitFor(() => expect(result.current.activeThemeId).toBe("basic"));
  });

  it("resolves to [] (not an error) when the active theme ships no static pages", async () => {
    const port = createFakeThemePagesPort({ activeThemeStaticPageIds: [] });
    const { result } = renderHook(() => useThemePages(port));
    await waitFor(() => expect(result.current.pageIds).not.toBeNull());
    expect(result.current.pageIds).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("sets the fallback error when the injected port rejects", async () => {
    const port = createFakeThemePagesPort({ getPresentationError: new Error("boom") });
    const { result } = renderHook(() => useThemePages(port));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("boom");
    expect(result.current.pageIds).toBeNull();
  });

  it("useWiredThemePages composes the real port — same controller shape before the real fetch settles", () => {
    const { result } = renderHook(() => useWiredThemePages());
    expect(result.current.pageIds).toBeNull();
    expect(result.current.activeThemeId).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
