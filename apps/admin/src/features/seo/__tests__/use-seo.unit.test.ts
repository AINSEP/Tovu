import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSeo } from "../hooks/use-seo.hooks";
import { createFakeSeoPort } from "../hooks/seo-dependencies.hooks";
import type { SeoSettings } from "@/lib/api";

/**
 * @file `useSeo` — the site-wide SEO settings form + sitemap regenerate action.
 * `Seo.unit.test.tsx` already exercises the full UI flow through mocked hook modules; this file
 * is the hook's own injected-port coverage — see `seo-port.hooks.ts` for why the injection exists.
 */

function settingsFixture(overrides: Partial<SeoSettings> = {}): SeoSettings {
  return {
    titleTemplate: "%s | Site",
    defaultRobots: { noindex: false, nofollow: false },
    sitemapEnabled: true,
    robotsRules: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSeo — injected port", () => {
  it("loads settings on mount from the fake port's seed, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeSeoPort({ settings: settingsFixture({ titleTemplate: "%s :: Seeded" }) });

    const { result } = renderHook(() => useSeo(port, "en"));

    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(result.current.settings?.titleTemplate).toBe("%s :: Seeded");
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("save writes through the port and sets a Saved. notice", async () => {
    const port = createFakeSeoPort({ settings: settingsFixture() });
    const { result } = renderHook(() => useSeo(port, "en"));
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.save({ titleTemplate: "%s | Updated" });
    });

    expect(result.current.settings?.titleTemplate).toBe("%s | Updated");
    expect(result.current.notice).toBe("Saved.");
  });

  it("saving null for an optional default clears it, and the cleared value reads back as undefined — never a literal null", async () => {
    // The fake models `setSeoSettings`' real clear path (`buildScalarWrites` normalizes `null` to
    // the `""` absent-sentinel, which `getSeoSettings` reads back through `undefinedIfEmpty`).
    // Spreading the patch verbatim instead would hand the UI a `null` no real response contains.
    const port = createFakeSeoPort({ settings: settingsFixture({ defaultDescription: "Seeded default" }) });
    const { result } = renderHook(() => useSeo(port, "en"));
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.save({ defaultDescription: null });
    });

    expect(result.current.settings?.defaultDescription).toBeUndefined();
    expect(result.current.settings).not.toHaveProperty("defaultDescription", null);
  });

  it("a key omitted from the patch is left alone — the write is a merge, so 'unchanged' must not clear", async () => {
    const port = createFakeSeoPort({ settings: settingsFixture({ defaultDescription: "Seeded default" }) });
    const { result } = renderHook(() => useSeo(port, "en"));
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.save({ titleTemplate: "%s | Updated" });
    });

    expect(result.current.settings?.defaultDescription).toBe("Seeded default");
  });

  it("regenerateSitemap calls the port without touching settings", async () => {
    const port = createFakeSeoPort({ settings: settingsFixture() });
    const { result } = renderHook(() => useSeo(port, "en"));
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.regenerateSitemap();
    });

    expect(result.current.notice).toBe("Sitemap regeneration accepted.");
    expect(result.current.error).toBeNull();
  });
});
