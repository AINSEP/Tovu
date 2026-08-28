import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSeoEntryPanel } from "../hooks/use-seo-entry-panel.hooks";
import { createFakeSeoPort } from "../hooks/seo-dependencies.hooks";
import type { SeoEntryAnalysis, SeoEntryMeta } from "@/lib/api";

/**
 * @file `useSeoEntryPanel` — the per-entry overrides form + analyze view.
 * `Seo.unit.test.tsx` already exercises the full UI flow through mocked hook modules; this file
 * is the hook's own injected-port coverage — see `seo-port.hooks.ts` for why the injection exists.
 */

function metaFixture(overrides: Partial<SeoEntryMeta> = {}): SeoEntryMeta {
  return {
    title: "Original title",
    description: "Original description",
    canonical: "https://example.com/post-1",
    robots: { noindex: false, nofollow: false },
    openGraph: { title: "Original title", type: "article", url: "https://example.com/post-1" },
    twitter: { card: "summary", title: "Original title" },
    jsonLd: [],
    ...overrides,
  };
}

function analysisFixture(overrides: Partial<SeoEntryAnalysis> = {}): SeoEntryAnalysis {
  return {
    entryId: "entry-1",
    score: 80,
    issues: [],
    resolved: metaFixture(),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSeoEntryPanel — injected port", () => {
  it("loads meta + analysis on mount from the fake port's seed, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeSeoPort({
      entries: { "entry-1": { meta: metaFixture(), analysis: analysisFixture() } },
    });

    const { result } = renderHook(() => useSeoEntryPanel({ entryId: "entry-1" }, port, "en"));

    await waitFor(() => expect(result.current.resolved).not.toBeNull());
    expect(result.current.resolved?.title).toBe("Original title");
    expect(result.current.analysis?.score).toBe(80);
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("save writes only the touched fields through the port and clears touched on success", async () => {
    const port = createFakeSeoPort({
      entries: { "entry-1": { meta: metaFixture(), analysis: analysisFixture() } },
    });
    const { result } = renderHook(() => useSeoEntryPanel({ entryId: "entry-1" }, port, "en"));
    await waitFor(() => expect(result.current.resolved).not.toBeNull());

    act(() => result.current.setField("title", "New title"));
    expect(result.current.touched).toEqual({ title: "New title" });

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.resolved?.title).toBe("New title");
    expect(result.current.touched).toEqual({});
    expect(result.current.notice).toBe("Saved.");
  });

  it("fieldValue falls back to the resolved value until the field is touched", async () => {
    const port = createFakeSeoPort({
      entries: { "entry-1": { meta: metaFixture({ description: "Resolved description" }), analysis: analysisFixture() } },
    });
    const { result } = renderHook(() => useSeoEntryPanel({ entryId: "entry-1" }, port, "en"));
    await waitFor(() => expect(result.current.resolved).not.toBeNull());

    expect(result.current.fieldValue("description", result.current.resolved!.description)).toBe("Resolved description");

    act(() => result.current.setField("description", "Draft description"));
    expect(result.current.fieldValue("description", result.current.resolved!.description)).toBe("Draft description");
  });
});
