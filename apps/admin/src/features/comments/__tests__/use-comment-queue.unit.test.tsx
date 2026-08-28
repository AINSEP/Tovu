import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdminComment } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";
import { createFakeCommentQueuePort } from "../hooks/comment-queue-dependencies.hooks";
import { useCommentQueue } from "../hooks/use-comment-queue.hooks";

/**
 * @file `useCommentQueue` — new coverage added alongside the `useWiredX` conversion
 * (`comment-queue-port.hooks.ts` / `comment-queue-dependencies.hooks.ts`). There was no
 * hook-level test file for this before — `Comments.unit.test.tsx` already exercises it
 * end-to-end through real `fetch` (mounted via `Comments`'s `QueueSection`); this file proves the
 * pure hook is independently testable against an injected port, no `fetch` stub required.
 *
 * `fetch-query` migration (2026-08-12): every `renderHook` now needs `wrapper: FetchQueryProvider`
 * — see `redirects/__tests__/use-redirects.hooks.unit.test.tsx`'s identical wrapper for the pilot
 * precedent.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const COMMENT: AdminComment = {
  id: "c1",
  workspaceId: "w1",
  entryId: "p1",
  parentId: null,
  threadRootId: "c1",
  depth: 0,
  status: "pending",
  authorPrincipalId: null,
  authorName: "Reader",
  authorEmail: "reader@example.com",
  authorUrl: null,
  authorIpHash: null,
  bodyText: "Nice post!",
  spamScore: null,
  spamProvider: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

describe("useCommentQueue", () => {
  it("loads the first page for the initial status through the injected port, without touching fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const port = createFakeCommentQueuePort({ items: [COMMENT], nextCursor: "cursor-2" });
      const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });

      await waitFor(() => expect(result.current.items).not.toBeNull());
      expect(result.current.items).toEqual([COMMENT]);
      expect(result.current.nextCursor).toBe("cursor-2");
      expect(port.listCalls).toEqual([{ status: "pending", cursor: undefined }]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("re-loads page 1 (reset) when the status filter changes", async () => {
    const port = createFakeCommentQueuePort({ items: [COMMENT] });
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    act(() => result.current.setStatus("trash"));
    await waitFor(() => expect(port.listCalls).toHaveLength(2));

    expect(port.listCalls[1]).toEqual({ status: "trash", cursor: undefined });
  });

  it("loadMore passes the current nextCursor through the injected port and appends results", async () => {
    const port = createFakeCommentQueuePort({ items: [COMMENT], nextCursor: "cursor-2" });
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    expect(port.listCalls[1]).toEqual({ status: "pending", cursor: "cursor-2" });
    expect(result.current.items).toEqual([COMMENT, COMMENT]);
  });

  it("onModerate moderates through the injected port and reloads page 1 on success", async () => {
    const port = createFakeCommentQueuePort({ items: [COMMENT] });
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    await act(async () => {
      await result.current.onModerate(COMMENT, "approve");
    });

    expect(port.moderateCalls).toEqual([{ commentId: "c1", action: "approve", expectedVersion: 1 }]);
    // The moderate call plus a reload of page 1 — the initial load is call 1.
    expect(port.listCalls).toHaveLength(2);
    expect(result.current.stateFor("c1").error).toBeNull();
  });

  it("sets the row's own error (not a global one) when the injected port's moderate call rejects", async () => {
    const port = createFakeCommentQueuePort({ items: [COMMENT], moderateError: new Error("stale version") });
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    await act(async () => {
      await result.current.onModerate(COMMENT, "approve");
    });

    expect(result.current.stateFor("c1").busy).toBe(false);
    expect(result.current.stateFor("c1").error).toBe("stale version");
  });

  it("onPurge purges the pending comment through the injected port, reloads, and clears pendingPurge", async () => {
    const port = createFakeCommentQueuePort({ items: [COMMENT] });
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    act(() => result.current.setPendingPurge(COMMENT));
    await act(async () => {
      await result.current.onPurge();
    });

    expect(port.purgeCalls).toEqual([{ commentId: "c1" }]);
    expect(result.current.pendingPurge).toBeNull();
  });

  it("is a no-op through the port when onPurge is called with no pendingPurge set", async () => {
    const port = createFakeCommentQueuePort({ items: [COMMENT] });
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    await act(async () => {
      await result.current.onPurge();
    });

    expect(port.purgeCalls).toEqual([]);
  });
});
