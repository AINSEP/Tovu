import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSeoEntryPanel } from "../hooks/use-seo-entry-panel.hooks";
import { createFakeSeoPort } from "../hooks/seo-dependencies.hooks";
import type { SeoPort } from "../hooks/seo-port.hooks";
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

/**
 * Clearing an override (2026-09-06). The server has accepted `null` as "remove this key" since
 * `eb10f5de` (`SeoExtFieldsPatch`, `apps/website/src/features/seo/types.ts`), but this hook could
 * only ever send `""` — which `setEntrySeoOverrides` stores as a REAL override and `seo.ts` then
 * resolves with `??`, so a blank beat the site default and there was no way back from the UI.
 *
 * Every assertion below reads the PUT body the port actually received, not the fake's merged
 * result: the fake's `applySeoPatch` folds `null` and `""` into the same resolved meta, so an
 * assertion on `resolved` would pass under the bug.
 */
describe("useSeoEntryPanel — clearing an override", () => {
  function recordingPort() {
    const fake = createFakeSeoPort({
      entries: { "entry-1": { meta: metaFixture(), analysis: analysisFixture() } },
    });
    const puts: unknown[] = [];
    const port: SeoPort = {
      ...fake,
      putSeoEntry(target, patch = {}) {
        puts.push(patch);
        return fake.putSeoEntry(target, patch);
      },
    };
    return { port, puts };
  }

  it("emptying a text field PUTs null for that key, not an empty string", async () => {
    const { port, puts } = recordingPort();
    const { result } = renderHook(() => useSeoEntryPanel({ entryId: "entry-1" }, port, "en"));
    await waitFor(() => expect(result.current.resolved).not.toBeNull());

    act(() => result.current.setField("title", ""));
    await act(async () => {
      await result.current.save();
    });

    expect(puts).toEqual([{ title: null }]);
  });

  it("emptying a URL field PUTs null for that key too", async () => {
    const { port, puts } = recordingPort();
    const { result } = renderHook(() => useSeoEntryPanel({ entryId: "entry-1" }, port, "en"));
    await waitFor(() => expect(result.current.resolved).not.toBeNull());

    act(() => result.current.setField("canonical", ""));
    act(() => result.current.setField("ogImage", ""));
    await act(async () => {
      await result.current.save();
    });

    expect(puts).toEqual([{ canonical: null, ogImage: null }]);
  });

  it("the null survives JSON serialization — an `undefined` clear would be dropped from the wire body entirely", async () => {
    const { port, puts } = recordingPort();
    const { result } = renderHook(() => useSeoEntryPanel({ entryId: "entry-1" }, port, "en"));
    await waitFor(() => expect(result.current.resolved).not.toBeNull());

    act(() => result.current.setField("description", ""));
    await act(async () => {
      await result.current.save();
    });

    expect(JSON.parse(JSON.stringify(puts[0]))).toEqual({ description: null });
  });

  it("a field the operator never touched stays absent — 'unchanged' must not become 'clear'", async () => {
    const { port, puts } = recordingPort();
    const { result } = renderHook(() => useSeoEntryPanel({ entryId: "entry-1" }, port, "en"));
    await waitFor(() => expect(result.current.resolved).not.toBeNull());

    act(() => result.current.setField("title", ""));
    await act(async () => {
      await result.current.save();
    });

    expect(Object.keys(puts[0] as object)).toEqual(["title"]);
  });

  it("a non-empty edit still PUTs the string, and a checkbox still PUTs its boolean", async () => {
    const { port, puts } = recordingPort();
    const { result } = renderHook(() => useSeoEntryPanel({ entryId: "entry-1" }, port, "en"));
    await waitFor(() => expect(result.current.resolved).not.toBeNull());

    act(() => result.current.setField("title", "New title"));
    act(() => result.current.setField("noindex", false));
    await act(async () => {
      await result.current.save();
    });

    expect(puts).toEqual([{ title: "New title", noindex: false }]);
  });

  it("fieldValue renders a cleared field as empty, so the box the operator emptied stays empty", async () => {
    const { port } = recordingPort();
    const { result } = renderHook(() => useSeoEntryPanel({ entryId: "entry-1" }, port, "en"));
    await waitFor(() => expect(result.current.resolved).not.toBeNull());

    act(() => result.current.setField("title", ""));
    expect(result.current.fieldValue("title", result.current.resolved!.title)).toBeNull();
  });
});
