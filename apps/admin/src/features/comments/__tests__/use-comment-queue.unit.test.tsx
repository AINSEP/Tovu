import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminComment, AdminCommentsQueuePage, CommentStatus } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { createFakeCommentQueuePort } from "../hooks/comment-queue-dependencies.hooks";
import { useCommentQueue } from "../hooks/use-comment-queue.hooks";
import type { CommentQueuePort } from "../hooks/comment-queue-port.hooks";
import { COMMENTS_QUEUE_RESOURCE } from "../rules";

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

/**
 * `onModerate`'s re-entry guard (`if (stateFor(comment.id).busy) return;`) reads `rowState` —
 * React state, not a ref — so it is NOT synchronous: two calls for the SAME comment fired in the
 * same tick (a real double-click through `RowMenu`, whose items carry no `disabled` state at all —
 * `QueueActionsCell` builds every menu item unconditionally, busy or not) both read `busy: false`
 * before either call's `patchRowState({ busy: true })` has committed, so both pass the guard and
 * both reach the port — potentially with two DIFFERENT, conflicting actions for the same comment.
 * Same class of bug `use-static-publish.hooks.ts`'s `publishingRef` fixes for `publish()`.
 */
describe("useCommentQueue — same-tick double-call safety", () => {
  it("two onModerate calls for the SAME comment in one tick must not both reach the port", async () => {
    const port = createFakeCommentQueuePort({ items: [COMMENT] });
    const settlers: Array<() => void> = [];
    port.moderateComment = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settlers.push(resolve);
        })
    );
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    act(() => {
      void result.current.onModerate(COMMENT, "approve");
      void result.current.onModerate(COMMENT, "spam");
    });

    expect(port.moderateComment).toHaveBeenCalledTimes(1);

    // Let the one accepted call settle so the busy flag clears cleanly.
    await act(async () => {
      settlers.forEach((resolve) => resolve());
    });
  });
});

describe("useCommentQueue — content refresh bus", () => {
  afterEach(() => resetContentRefreshBus());

  it("re-reads the queue when a content refresh fires, so an assistant moderation action appears without a reload", async () => {
    const items = [COMMENT];
    const port = createFakeCommentQueuePort({ items });
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).toEqual([COMMENT]));

    // The assistant's `comments_approve_comment` call landing server-side — the screen has no other
    // way to know it happened.
    items.push({ ...COMMENT, id: "c2" });
    expect(result.current.items).toEqual([COMMENT]);

    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.items).toHaveLength(2));
  });

  it("refreshes on a notification that names comments-queue, and ignores one that names only other resources", async () => {
    const items = [COMMENT];
    const port = createFakeCommentQueuePort({ items });
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).toEqual([COMMENT]));

    items.push({ ...COMMENT, id: "c2" });

    act(() => publishContentRefresh(["taxonomy"]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.items).toEqual([COMMENT]);

    act(() => publishContentRefresh([COMMENTS_QUEUE_RESOURCE]));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
  });

  it("stops re-reading once unmounted", async () => {
    const port = createFakeCommentQueuePort({ items: [COMMENT] });
    const { result, unmount } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    const callsWhileMounted = port.listCalls.length;
    unmount();
    act(() => publishContentRefresh());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(port.listCalls).toHaveLength(callsWhileMounted);
  });
});

/**
 * S3 (`ADS-memory/.local-artifacts/terra-admin-review-2026-09-20/plan-content2.md`) — same family
 * of bugs as forms' `use-form-submissions.unit.test.tsx` "Load more paging" describe block, and the
 * same fix shape: `loadMore` had no in-flight guard (a same-tick double call reached the port
 * twice), a stuck `loadingMore` if `status` changed mid-flight (the old `statusAtCall !==
 * statusRef.current` finally-check silently drops the reset, forever), `moreError` surviving a
 * retry, and a content refresh keeping stale accumulated pages instead of dropping them.
 *
 * `createControlledQueuePort`'s cursorless calls resolve with whatever `setFirstPage` last set
 * (defaulting to page 1 for COMMENT); cursor calls never resolve on their own — each pushes a
 * `{ resolve, reject }` pair onto `cursorCalls` for a test to settle manually (same deferred idiom
 * `use-form-submissions.unit.test.tsx`'s `createControlledPort` uses).
 */
describe("useCommentQueue — Load more paging (2026-09-20)", () => {
  afterEach(() => resetContentRefreshBus());

  interface ControlledQueuePort {
    port: CommentQueuePort;
    cursorCalls: Array<{ resolve: (v: AdminCommentsQueuePage) => void; reject: (e: Error) => void }>;
    setFirstPage: (page: AdminCommentsQueuePage) => void;
  }

  function createControlledQueuePort(): ControlledQueuePort {
    let firstPageResult: AdminCommentsQueuePage = { items: [COMMENT], nextCursor: "c2" };
    const cursorCalls: ControlledQueuePort["cursorCalls"] = [];
    const port: CommentQueuePort = {
      listCommentsQueue: vi.fn((options: { status?: CommentStatus; cursor?: string }) => {
        if (options.cursor) {
          return new Promise<AdminCommentsQueuePage>((resolve, reject) => {
            cursorCalls.push({ resolve, reject });
          });
        }
        return Promise.resolve(firstPageResult);
      }),
      async moderateComment() {
        throw new Error("not used by this test");
      },
      async purgeComment() {
        throw new Error("not used by this test");
      },
    };
    return {
      port,
      cursorCalls,
      setFirstPage(page) {
        firstPageResult = page;
      },
    };
  }

  it("switching status while Load more is in flight does not leave loadingMore stuck", async () => {
    const { port, cursorCalls } = createControlledQueuePort();
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.nextCursor).toBe("c2"));

    act(() => {
      void result.current.loadMore();
    });
    await waitFor(() => expect(cursorCalls).toHaveLength(1));
    expect(result.current.loadingMore).toBe(true);

    act(() => result.current.setStatus("trash"));
    await waitFor(() => expect(result.current.status).toBe("trash"));
    await waitFor(() => expect(result.current.items).toEqual([COMMENT])); // trash's own first page settled
    expect(result.current.loadingMore).toBe(false);

    const itemsAfterSwitch = result.current.items;
    await act(async () => {
      cursorCalls[0].resolve({ items: [{ ...COMMENT, id: "c2" }], nextCursor: null });
      await Promise.resolve();
    });

    // The superseded pending's-status page must not land under the new filter.
    expect(result.current.items).toEqual(itemsAfterSwitch);
  });

  it("two loadMore calls in one tick reach the port once", async () => {
    const { port, cursorCalls } = createControlledQueuePort();
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.nextCursor).toBe("c2"));

    act(() => {
      void result.current.loadMore();
      void result.current.loadMore();
    });

    // 1 first-page call (on mount) + 1 loadMore call — the second same-tick call must be dropped
    // by the in-flight guard. Today (no guard) this is 3.
    expect(port.listCommentsQueue).toHaveBeenCalledTimes(2);
    expect(cursorCalls).toHaveLength(1);

    await act(async () => {
      cursorCalls[0].resolve({ items: [{ ...COMMENT, id: "c2" }], nextCursor: null });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.items?.map((c) => c.id)).toEqual(["c1", "c2"]));
  });

  it("a successful Load more retry clears the previous failure", async () => {
    const { port, cursorCalls } = createControlledQueuePort();
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.nextCursor).toBe("c2"));

    act(() => {
      void result.current.loadMore();
    });
    await waitFor(() => expect(cursorCalls).toHaveLength(1));
    await act(async () => {
      cursorCalls[0].reject(new Error("network down"));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.error).toBe("network down"));

    act(() => {
      void result.current.loadMore();
    });
    await waitFor(() => expect(cursorCalls).toHaveLength(2));
    await act(async () => {
      cursorCalls[1].resolve({ items: [{ ...COMMENT, id: "c2" }], nextCursor: null });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it("a content-refresh refetch drops stale Load more pages", async () => {
    const { port, cursorCalls, setFirstPage } = createControlledQueuePort();
    const { result } = renderHook(() => useCommentQueue({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.nextCursor).toBe("c2"));

    act(() => {
      void result.current.loadMore();
    });
    await waitFor(() => expect(cursorCalls).toHaveLength(1));
    await act(async () => {
      cursorCalls[0].resolve({ items: [{ ...COMMENT, id: "c2" }], nextCursor: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.items?.map((c) => c.id)).toEqual(["c1", "c2"]));

    // A different first page landing (same trigger `publishContentRefresh` — the "content refresh
    // bus" describe block above — as an assistant moderation action would cause server-side).
    setFirstPage({ items: [{ ...COMMENT, id: "c3" }], nextCursor: "c4" });
    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.items?.map((c) => c.id)).toEqual(["c3"]));
    expect(result.current.nextCursor).toBe("c4");
  });
});
