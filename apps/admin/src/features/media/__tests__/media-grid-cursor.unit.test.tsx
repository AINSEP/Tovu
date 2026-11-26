import { KEYS } from "@jini-ai/admin/screens/media/rules";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCallback, useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import type { AdminMedia, MediaGridPage } from "@jini-ai/core/contracts/site/cms-admin-media";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useGridPages, type MediaGridPort, type MediaGridPageRequest, type MediaGridView } from "@jini-ai/cms/react/media/hooks/use-grid-pages.hooks";

/**
 * @file The grid's server paging seen from the screen's hook: a late page of a view nobody is looking at
 * is dropped, and a direct link beyond page one is one exact lookup, never a walk over pages. Why-comment:
 * sorting or filtering one fetched page cannot reproduce a globally ordered, filtered list, so counts and
 * order stay the server's.
 */

const wrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider>{children}</FetchQueryProvider>;

function asset(id: string): AdminMedia {
  return { id, title: id, status: "active", contentType: "image/png", createdAt: "2026-01-01T00:00:00.000Z" } as AdminMedia;
}

const COUNTS = { all: 5, images: 3, videos: 2, trash: 0 };

/** A port whose every answer the test releases by hand, and which records each request. */
function deferredPort() {
  const calls: Array<{ view: MediaGridView; page: MediaGridPageRequest }> = [];
  const waiting: Array<{ view: MediaGridView; page: MediaGridPageRequest; resolve: (page: MediaGridPage) => void }> = [];
  const port: MediaGridPort = {
    listMediaGrid: (view, page = {}) => {
      calls.push({ view, page });
      return new Promise<MediaGridPage>((resolve) => waiting.push({ view, page, resolve }));
    },
  };
  return { port, calls, waiting };
}

const answer = (ids: string[], nextCursor: string | null): MediaGridPage => ({ media: ids.map(asset), nextCursor, counts: COUNTS, hasUntypedActive: false });

describe("media grid cursor paging", () => {
  it("changing tabs during load more drops the stale response and keeps exact counts", async () => {
    const { port, waiting } = deferredPort();
    const videoCounts = { all: 7, images: 4, videos: 3, trash: 1 };
    const lateCounts = { all: 6, images: 5, videos: 1, trash: 2 };
    const { result, rerender } = renderHook(({ tab }) => useGridPages({ port, tab, orderBy: "created", useFetchQuery, listKey: KEYS.list, useCallback, useState }), { wrapper, initialProps: { tab: "all" as const } as { tab: "all" | "videos" } });
    await waitFor(() => expect(waiting.length).toBe(1));
    await act(async () => waiting[0].resolve(answer(["a1", "a2"], "cursor-1")));
    await waitFor(() => expect(result.current.items?.map((item) => item.id)).toEqual(["a1", "a2"]));
    expect(result.current.counts).toEqual(COUNTS);

    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = result.current.loadMore(); });
    await waitFor(() => expect(waiting.length).toBe(2));
    expect(waiting[1].page.cursor).toBe("cursor-1");

    rerender({ tab: "videos" });
    await waitFor(() => expect(waiting.length).toBe(3));
    expect(waiting[2].view).toEqual({ tab: "videos", orderBy: "created" });
    await act(async () => waiting[2].resolve({ media: [{ ...asset("v1"), contentType: "video/mp4" }], nextCursor: null, counts: videoCounts, hasUntypedActive: false }));
    await waitFor(() => expect(result.current.items?.map((item) => item.id)).toEqual(["v1"]));
    expect(result.current.counts).toEqual(videoCounts);

    // The All page that was in flight answers now: it belongs to a view nobody is looking at.
    await act(async () => { waiting[1].resolve({ ...answer(["a3", "a4"], null), counts: lateCounts }); await pending; });
    expect(result.current.items?.map((item) => item.id)).toEqual(["v1"]);
    expect(result.current.counts).toEqual(videoCounts);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.items?.some((item) => item.id === "a3")).toBe(false);
  });

  it("a direct link opens an asset beyond page one without scanning pages", async () => {
    const { port, calls, waiting } = deferredPort();
    const { result } = renderHook(() => useGridPages({ port, tab: "all", orderBy: "created", useFetchQuery, listKey: KEYS.list, useCallback, useState }, { itemId: "deep" }), { wrapper });
    await waitFor(() => expect(waiting.length).toBe(1));
    await act(async () => waiting[0].resolve(answer(["p1", "p2"], "cursor-1")));

    await waitFor(() => expect(waiting.length).toBe(2));
    expect(waiting[1].page).toEqual({ itemId: "deep" });
    await act(async () => waiting[1].resolve({ media: [asset("deep")], nextCursor: null, counts: COUNTS, hasUntypedActive: false }));

    await waitFor(() => expect(result.current.exactItem?.id).toBe("deep"));
    expect(result.current.items?.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(calls.filter((call) => call.page.cursor !== undefined)).toHaveLength(0);
    expect(calls).toHaveLength(2);
  });
});
