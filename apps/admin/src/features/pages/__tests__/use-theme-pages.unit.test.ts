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
    expect(result.current.error).toBeNull();
  });
});
