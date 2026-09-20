import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminTrashItem } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { createFakeTrashPort } from "../hooks/trash-dependencies.hooks";
import { useTrash } from "../hooks/use-trash.hooks";
import { TRASH_RESOURCE } from "../rules";

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
