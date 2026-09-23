import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminIdentityUser, AdminTrashItem, AdminTrashPage } from "@/lib/api";
import { FetchQueryProvider, useInvalidate } from "@/lib/fetch-query";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { createFakeTrashPort } from "../hooks/trash-dependencies.hooks";
import { useTrash } from "../hooks/use-trash.hooks";
import type { TrashPort } from "../hooks/trash-port.hooks";
import { KEYS, TRASH_RESOURCE } from "../rules";

/**
 * @file `useTrash` — the Trash screen's whole state, against an injected port.
 *
 * The cases here are the ones where getting it wrong is expensive: what the two batch endpoints are
 * actually SENT (a purge names trash row ids, a restore names `{entityType, entityId}` — sending
 * the wrong one would either 400 or, worse, act on the wrong row), what the operator is told when
 * only some items moved, and whether a background refresh can leave a stale id in the selection
 * that a later "Delete permanently" would then destroy.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function item(overrides: Partial<AdminTrashItem> = {}): AdminTrashItem {
  return {
    id: "trash-1",
    entityType: "post",
    entityId: "post-1",
    title: "A post",
    subtitle: null,
    trashedAt: "2026-09-01T00:00:00.000Z",
    purgeAfter: "2026-10-31T00:00:00.000Z",
    daysRemaining: 41,
    actorPrincipalId: "principal-1",
    actorPluginId: null,
    actorUsername: "jdoe",
    ...overrides,
  };
}

function user(overrides: Partial<AdminIdentityUser> = {}): AdminIdentityUser {
  return {
    principalId: "principal-1",
    workspaceId: "ws-1",
    username: "admin",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    roleIds: [],
    policyIds: [],
    ...overrides,
  };
}

afterEach(() => {
  resetContentRefreshBus();
  vi.unstubAllGlobals();
});

describe("useTrash", () => {
  it("loads the first page through the injected port, without touching fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const port = createFakeTrashPort({ items: [item()], nextCursor: "cursor-2" });

    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });

    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toEqual([item()]);
    expect(result.current.nextCursor).toBe("cursor-2");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("purge sends TRASH ROW IDS and restore sends {entityType, entityId}", async () => {
    const port = createFakeTrashPort({ items: [item({ id: "row-9", entityId: "post-9" })] });
    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    act(() => result.current.toggle("row-9"));
    await act(async () => {
      await result.current.onRestoreSelected();
    });
    expect(port.restoreCalls).toEqual([{ items: [{ entityType: "post", entityId: "post-9" }] }]);

    await waitFor(() => expect(result.current.items).not.toBeNull());
    act(() => result.current.toggle("row-9"));
    await act(async () => {
      await result.current.onPurgeConfirmed();
    });
    expect(port.purgeCalls).toEqual([{ ids: ["row-9"] }]);
  });

  it("select-all covers only the rows on screen, and toggles back off", async () => {
    const port = createFakeTrashPort({ items: [item({ id: "a" }), item({ id: "b" })], nextCursor: "more" });
    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    act(() => result.current.toggleAll());
    expect([...result.current.selected].sort()).toEqual(["a", "b"]);
    expect(result.current.allSelected).toBe(true);

    act(() => result.current.toggleAll());
    expect(result.current.selected.size).toBe(0);
  });

  it("a partly forbidden purge says so, instead of reporting a silent success", async () => {
    const port = createFakeTrashPort({
      items: [item({ id: "a" }), item({ id: "b", entityType: "comment", entityId: "comment-1" })],
      purgeReport: {
        purged: 1,
        results: [
          { id: "a", outcome: "forbidden" },
          { id: "b", outcome: "purged" },
        ],
      },
    });
    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    act(() => result.current.toggleAll());
    await act(async () => {
      await result.current.onPurgeConfirmed();
    });

    expect(result.current.notice).toBe("Deleted permanently. 1/2");
    expect(result.current.purgeConfirmOpen).toBe(false);
  });

  it("a purge in which nothing succeeded does not claim anything was deleted", async () => {
    const port = createFakeTrashPort({
      items: [item({ id: "a" })],
      purgeReport: { purged: 0, results: [{ id: "a", outcome: "forbidden" }] },
    });
    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    act(() => result.current.toggle("a"));
    await act(async () => {
      await result.current.onPurgeConfirmed();
    });

    expect(result.current.notice).toBe("Nothing was deleted.");
  });

  it("an out-of-band write refreshes the list — the screen does not keep saying the Trash is empty", async () => {
    let page: AdminTrashItem[] = [];
    const port = {
      listCalls: [] as Array<{ cursor?: string }>,
      async listTrash(options: { cursor?: string }) {
        this.listCalls.push(options);
        return { items: page, nextCursor: null };
      },
      async restoreTrashItems() {
        return { restored: 0, results: [] };
      },
      async purgeTrashItems() {
        return { purged: 0, results: [] };
      },
    };

    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).toEqual([]));

    // An agent deletes a post: `content_post_delete` writes an index row and publishes on the bus.
    page = [item()];
    act(() => publishContentRefresh([TRASH_RESOURCE]));

    await waitFor(() => expect(result.current.items).toEqual([item()]));
  });

  it("a row that disappears from the list drops out of the selection", async () => {
    let page: AdminTrashItem[] = [item({ id: "a" }), item({ id: "b" })];
    const port = {
      async listTrash() {
        return { items: page, nextCursor: null };
      },
      async restoreTrashItems() {
        return { restored: 0, results: [] };
      },
      async purgeTrashItems() {
        return { purged: 0, results: [] };
      },
    };

    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());
    act(() => result.current.toggleAll());
    expect(result.current.selected.size).toBe(2);

    // The 60-day sweeper, or another operator, removed one of them.
    page = [item({ id: "a" })];
    act(() => publishContentRefresh([TRASH_RESOURCE]));

    await waitFor(() => expect([...result.current.selected]).toEqual(["a"]));
  });

  it("a failed load is reported rather than shown as an empty Trash", async () => {
    const port = createFakeTrashPort({ listError: new Error("boom") });
    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.items).toBeNull();
  });
});

/**
 * `actorUsernames` (2026-09-21): the client-side resolution table `rules.ts`'s `actorLabel` falls
 * back to when a row's `actorUsername` is absent — the owner's-own-deletions-read-'Unknown' report
 * against the desktop app's older server. Loaded through the SAME injected `port`, so these stay
 * fakeable exactly like every other call here; no direct `lib/api` reach.
 */
describe("useTrash — actorUsernames (2026-09-21)", () => {
  it("resolves the workspace's users into a principalId -> username map", async () => {
    const port = createFakeTrashPort({
      items: [item()],
      users: [user({ principalId: "principal-owner", username: "admin" }), user({ principalId: "principal-2", username: "jdoe" })],
    });
    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });

    await waitFor(() => expect(result.current.actorUsernames.get("principal-owner")).toBe("admin"));
    expect(result.current.actorUsernames.get("principal-2")).toBe("jdoe");
    expect(port.listUsersCalls).toBe(1);
  });

  it("degrades to an empty map, without touching `error`, when listUsers fails (an operator without user.manage/member.manage)", async () => {
    const port = createFakeTrashPort({ items: [item()], listUsersError: new Error("403 forbidden") });
    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });

    await waitFor(() => expect(result.current.items).not.toBeNull());
    // Give the (failing) actorUsernames query a turn to settle.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.actorUsernames.size).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it("stays an empty map, without calling listUsers, when the port carries no listUsers method at all", async () => {
    const port = {
      listCalls: [] as Array<{ cursor?: string }>,
      async listTrash(options: { cursor?: string }) {
        this.listCalls.push(options);
        return { items: [item()], nextCursor: null };
      },
      async restoreTrashItems() {
        return { restored: 0, results: [] };
      },
      async purgeTrashItems() {
        return { purged: 0, results: [] };
      },
    };

    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    expect(result.current.actorUsernames.size).toBe(0);
  });
});

/**
 * Refresh (2026-09-21, forms plan §C): a "rescan" button plus automatic freshness, because a delete
 * from ANY other screen, the assistant, or a second desktop instance has no single write path that
 * could invalidate this query for it. `staleTime: 0` is what makes the remount case GREEN; before it
 * the query's own `useFetchQuery` call carried no `staleTime`, so a remount inside the client's
 * shared 10s default (`adapter.tanstack.tsx`'s `createClient`) served the stale cached page instead
 * of refetching.
 */
describe("useTrash — Refresh (2026-09-21)", () => {
  it("a remount within 10s shows freshly changed rows, not the stale cache (staleTime: 0)", async () => {
    let rows: AdminTrashItem[] = [item({ id: "a" })];
    const listTrash = vi.fn(async () => ({ items: rows, nextCursor: null }));
    const port: TrashPort = {
      listTrash,
      async restoreTrashItems() {
        return { restored: 0, results: [] };
      },
      async purgeTrashItems() {
        return { purged: 0, results: [] };
      },
    };

    function TrashChild() {
      const trash = useTrash({ port, locale: "en" });
      return <span data-testid="ids">{trash.items?.map((i) => i.id).join(",") ?? "loading"}</span>;
    }
    function Harness({ mounted }: { mounted: boolean }) {
      return mounted ? <TrashChild /> : <span data-testid="ids">unmounted</span>;
    }

    const { rerender } = render(
      <FetchQueryProvider>
        <Harness mounted />
      </FetchQueryProvider>
    );
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("a"));

    rerender(
      <FetchQueryProvider>
        <Harness mounted={false} />
      </FetchQueryProvider>
    );
    expect(screen.getByTestId("ids")).toHaveTextContent("unmounted");

    rows = [item({ id: "b" })];
    rerender(
      <FetchQueryProvider>
        <Harness mounted />
      </FetchQueryProvider>
    );
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("b"));
    expect(listTrash).toHaveBeenCalledTimes(2);
  });

  it("'refreshing' is true only while the refresh's own fetch is pending", async () => {
    let resolveSecond!: (v: AdminTrashPage) => void;
    let call = 0;
    const port: TrashPort = {
      listTrash: vi.fn(() => {
        call++;
        if (call === 1) return Promise.resolve({ items: [item()], nextCursor: null });
        return new Promise<AdminTrashPage>((resolve) => {
          resolveSecond = resolve;
        });
      }),
      async restoreTrashItems() {
        return { restored: 0, results: [] };
      },
      async purgeTrashItems() {
        return { purged: 0, results: [] };
      },
    };
    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.refreshing).toBe(false);

    act(() => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(true));

    await act(async () => {
      resolveSecond({ items: [item()], nextCursor: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it("refresh() drops accumulated 'more' pages, and a Load more still in flight when it lands does not append", async () => {
    let firstPageResult: AdminTrashPage = { items: [item({ id: "p1" })], nextCursor: "c2" };
    const cursorCalls: Array<{ resolve: (v: AdminTrashPage) => void }> = [];
    const port: TrashPort = {
      listTrash: vi.fn((options: { cursor?: string }) => {
        if (options.cursor) {
          return new Promise<AdminTrashPage>((resolve) => {
            cursorCalls.push({ resolve });
          });
        }
        return Promise.resolve(firstPageResult);
      }),
      async restoreTrashItems() {
        throw new Error("not used by this test");
      },
      async purgeTrashItems() {
        throw new Error("not used by this test");
      },
    };
    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.nextCursor).toBe("c2"));

    act(() => {
      void result.current.loadMore();
    });
    await waitFor(() => expect(cursorCalls).toHaveLength(1));

    firstPageResult = { items: [item({ id: "fresh" })], nextCursor: null };
    act(() => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.items?.map((i) => i.id)).toEqual(["fresh"]));

    // The Load more from before the refresh finally resolves — it must not append onto the
    // refreshed page.
    await act(async () => {
      cursorCalls[0].resolve({ items: [item({ id: "stale-more" })], nextCursor: null });
      await Promise.resolve();
    });
    expect(result.current.items?.map((i) => i.id)).toEqual(["fresh"]);
  });

  it("refresh() does not clear the current selection", async () => {
    const port = createFakeTrashPort({ items: [item({ id: "a" })] });
    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    act(() => result.current.toggle("a"));
    expect(result.current.selected.has("a")).toBe(true);

    act(() => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    // The row is still on screen after the refresh, so the reconcile-selection effect keeps it.
    expect(result.current.selected.has("a")).toBe(true);
  });
});

/**
 * Load more paging (2026-09-21): same family of bugs already fixed in forms'
 * `use-form-submissions.hooks.ts` (`45f58ea16`) and comments' `use-comment-queue.hooks.ts`
 * (`c51d43854`) — `loadMore` had no in-flight guard, and a refetched first page (this screen's own
 * `reloadAfterAction`, or a background `useContentRefreshSubscription` refresh) kept the stale
 * accumulated "more" pages instead of dropping them, so a `loadMore` still in flight when the
 * refetch landed could append its page on top of the fresh page 1.
 *
 * `createControlledPort`'s cursorless calls resolve with whatever `setFirstPage` last set
 * (defaulting to page 1 with `nextCursor: "c2"`); cursor calls never resolve on their own — each
 * pushes a `{ resolve, reject }` pair onto `cursorCalls` for a test to settle manually, same
 * deferred idiom as `use-comment-queue.unit.test.tsx`'s `createControlledQueuePort`.
 */
describe("useTrash — Load more paging (2026-09-21)", () => {
  interface ControlledPort {
    port: TrashPort;
    cursorCalls: Array<{ resolve: (v: AdminTrashPage) => void; reject: (e: Error) => void }>;
    setFirstPage: (items: AdminTrashItem[], nextCursor: string | null) => void;
  }

  function createControlledPort(): ControlledPort {
    let firstPageResult: AdminTrashPage = { items: [item()], nextCursor: "c2" };
    const cursorCalls: ControlledPort["cursorCalls"] = [];
    const port: TrashPort = {
      listTrash: vi.fn((options: { cursor?: string }) => {
        if (options.cursor) {
          return new Promise<AdminTrashPage>((resolve, reject) => {
            cursorCalls.push({ resolve, reject });
          });
        }
        return Promise.resolve(firstPageResult);
      }),
      async restoreTrashItems() {
        throw new Error("not used by this test");
      },
      async purgeTrashItems() {
        throw new Error("not used by this test");
      },
    };
    return {
      port,
      cursorCalls,
      setFirstPage(items, nextCursor) {
        firstPageResult = { items, nextCursor };
      },
    };
  }

  it("two loadMore calls in the same tick send one request and append the page once", async () => {
    const { port, cursorCalls } = createControlledPort();
    const { result } = renderHook(() => useTrash({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.nextCursor).toBe("c2"));

    act(() => {
      void result.current.loadMore();
      void result.current.loadMore();
    });

    // 1 first-page call (on mount) + 1 loadMore call — the second same-tick call must be dropped
    // by the in-flight guard. Without the `loadingMoreRef` guard this is 3.
    expect(port.listTrash).toHaveBeenCalledTimes(2);
    expect(cursorCalls).toHaveLength(1);

    await act(async () => {
      cursorCalls[0].resolve({ items: [item({ id: "page2" })], nextCursor: null });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.items?.map((i) => i.id)).toEqual(["trash-1", "page2"]));
  });

  it("a reload drops a stale Load more page instead of appending it onto the fresh page 1", async () => {
    const { port, cursorCalls, setFirstPage } = createControlledPort();
    const { result } = renderHook(() => ({ trash: useTrash({ port, locale: "en" }), invalidate: useInvalidate() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.trash.nextCursor).toBe("c2"));

    act(() => {
      void result.current.trash.loadMore();
    });
    await waitFor(() => expect(cursorCalls).toHaveLength(1));

    // The reload lands (e.g. `reloadAfterAction` after a restore/purge, or a background
    // content-refresh) while the loadMore above is still in flight.
    setFirstPage([item({ id: "fresh" })], null);
    act(() => result.current.invalidate(KEYS.listRoot));
    await waitFor(() => expect(result.current.trash.items?.map((i) => i.id)).toEqual(["fresh"]));

    // The stale loadMore finally resolves.
    await act(async () => {
      cursorCalls[0].resolve({ items: [item({ id: "stale" })], nextCursor: null });
      await Promise.resolve();
    });

    // Must contain only the fresh page — the stale page must not have appended.
    expect(result.current.trash.items?.map((i) => i.id)).toEqual(["fresh"]);
  });

  it("a stale loadMore's failure after a reload is not surfaced as an error", async () => {
    const { port, cursorCalls, setFirstPage } = createControlledPort();
    const { result } = renderHook(() => ({ trash: useTrash({ port, locale: "en" }), invalidate: useInvalidate() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.trash.nextCursor).toBe("c2"));

    act(() => {
      void result.current.trash.loadMore();
    });
    await waitFor(() => expect(cursorCalls).toHaveLength(1));

    setFirstPage([item({ id: "fresh" })], null);
    act(() => result.current.invalidate(KEYS.listRoot));
    await waitFor(() => expect(result.current.trash.items?.map((i) => i.id)).toEqual(["fresh"]));

    await act(async () => {
      cursorCalls[0].reject(new Error("stale network error"));
      await Promise.resolve();
    });

    expect(result.current.trash.error).toBeNull();
  });

  it("a stale loadMore settling after a reload does not release a newer call's in-flight lock", async () => {
    const { port, cursorCalls, setFirstPage } = createControlledPort();
    const { result } = renderHook(() => ({ trash: useTrash({ port, locale: "en" }), invalidate: useInvalidate() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.trash.nextCursor).toBe("c2"));

    act(() => {
      void result.current.trash.loadMore(); // call 1, cursor c2
    });
    await waitFor(() => expect(cursorCalls).toHaveLength(1));

    // The reload lands, releasing call 1's lock and superseding its generation.
    setFirstPage([item({ id: "fresh" })], "c3");
    act(() => result.current.invalidate(KEYS.listRoot));
    await waitFor(() => expect(result.current.trash.items?.map((i) => i.id)).toEqual(["fresh"]));
    expect(result.current.trash.nextCursor).toBe("c3");
    expect(result.current.trash.loadingMore).toBe(false);

    act(() => {
      void result.current.trash.loadMore(); // call 2, cursor c3 — owns the lock now
    });
    await waitFor(() => expect(cursorCalls).toHaveLength(2));
    expect(result.current.trash.loadingMore).toBe(true);

    // Call 1's stale response finally arrives. It must not release call 2's lock.
    await act(async () => {
      cursorCalls[0].resolve({ items: [item({ id: "stale" })], nextCursor: null });
      await Promise.resolve();
    });
    expect(result.current.trash.loadingMore).toBe(true);

    // A third loadMore attempt must be blocked — the lock still belongs to call 2, still pending.
    act(() => {
      void result.current.trash.loadMore();
    });
    expect(cursorCalls).toHaveLength(2);

    await act(async () => {
      cursorCalls[1].resolve({ items: [item({ id: "page2" })], nextCursor: null });
      await Promise.resolve();
    });

    expect(result.current.trash.items?.map((i) => i.id)).toEqual(["fresh", "page2"]);
    expect(result.current.trash.loadingMore).toBe(false);
  });
});
