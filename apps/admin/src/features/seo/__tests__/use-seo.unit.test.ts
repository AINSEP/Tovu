import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSeo } from "../hooks/use-seo.hooks";
import { createFakeSeoPort } from "../hooks/seo-dependencies.hooks";
import type { SeoSettings } from "../../../lib/api";

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
