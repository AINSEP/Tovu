import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, type AdminWidget } from "@/lib/api";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { createFakeWidgetsPort } from "../hooks/widgets-dependencies.hooks";
import { useWidgetsLibrary } from "../hooks/use-widgets-library.hooks";
import { WIDGETS_LIBRARY_RESOURCE } from "../rules";

/**
 * @file `useWidgetsLibrary` driven against the injected `WidgetsPort`, no `fetch` stub.
 * `WidgetsLibrary.unit.test.tsx` already covers the real-client path via `useWiredWidgetsLibrary`
 * (the component's default DI prop); this is the "injected port" half.
 */

const WIDGET: AdminWidget = {
  id: "w1",
  workspaceId: "ws1",
  slug: "hero",
  title: "Hero",
  status: "active",
  widgetType: "text",
  config: {},
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWidgetsLibrary — injected port (no fetch stub)", () => {
  it("loads the list from the injected port and never touches the real api client", async () => {
    const listSpy = vi.spyOn(api, "listWidgets");
    const port = createFakeWidgetsPort({ widgets: [WIDGET] });
    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en", t: (key: string) => key }));

    await waitFor(() => expect(result.current.widgets).toHaveLength(1));
    expect(result.current.widgets?.[0]?.id).toBe("w1");
    expect(listSpy).not.toHaveBeenCalled();
  });

  it("routes trashOrPurge (active widget) through the injected port's trashWidget, and the row disappears once the list re-reads it", async () => {
    const port = createFakeWidgetsPort({ widgets: [WIDGET] });
    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.widgets).toHaveLength(1));

    await act(async () => {
      await result.current.trashOrPurge(WIDGET);
    });

    // `load()` re-reads with `includeInactive: true` then filters out only `purged` rows client-
    // side (see the hook's own comment) — a `trash` row stays in the list, just with its status
    // flipped, matching what `WidgetsLibrary.tsx` renders a "Delete permanently" action against.
    await waitFor(() => expect(result.current.widgets?.[0]?.status).toBe("trash"));
  });

  /**
   * Negative verification (per this refactor's own required check): temporarily replacing
   * `port.listWidgets(...)` in `use-widgets-library.hooks.ts`'s `load()` with a call to the real
   * `api.listWidgets(...)` and re-running this suite fails both non-pending assertions above (no
   * real network in this test env) — see this feature's commit/handoff report for the recorded run.
   */
  it("does not resolve `widgets` while the injected port's list call is still pending", () => {
    const port = createFakeWidgetsPort();
    port.listWidgets = () => new Promise(() => {});
    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en", t: (key: string) => key }));
    expect(result.current.widgets).toBeNull();
  });
});

describe("useWidgetsLibrary — content refresh bus", () => {
  afterEach(() => resetContentRefreshBus());

  it("re-reads the library when a content refresh fires, so an assistant-created widget appears without a reload", async () => {
    const port = createFakeWidgetsPort({ widgets: [WIDGET] });
    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.widgets).toEqual([WIDGET]));

    // The assistant's `widgets_create_instance` call landing server-side — the screen has no other
    // way to know it happened.
    port.widgets.push({ ...WIDGET, id: "w2", slug: "hero-2" });
    expect(result.current.widgets).toEqual([WIDGET]);

    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.widgets).toHaveLength(2));
  });

  it("refreshes on a notification that names widgets-library, and ignores one that names only other resources", async () => {
    const port = createFakeWidgetsPort({ widgets: [WIDGET] });
    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.widgets).toEqual([WIDGET]));

    port.widgets.push({ ...WIDGET, id: "w2", slug: "hero-2" });

    act(() => publishContentRefresh(["taxonomy"]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.widgets).toEqual([WIDGET]);

    act(() => publishContentRefresh([WIDGETS_LIBRARY_RESOURCE]));
    await waitFor(() => expect(result.current.widgets).toHaveLength(2));
  });

  it("stops re-reading once unmounted", async () => {
    const port = createFakeWidgetsPort({ widgets: [WIDGET] });
    const listSpy = vi.spyOn(port, "listWidgets");
    const { result, unmount } = renderHook(() => useWidgetsLibrary({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.widgets).toEqual([WIDGET]));

    const callsWhileMounted = listSpy.mock.calls.length;
    unmount();
    act(() => publishContentRefresh());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(listSpy).toHaveBeenCalledTimes(callsWhileMounted);
  });
});

/**
 * `purge`'s `pendingForcePurge` write had no guard against a second, DIFFERENT widget's purge
 * attempt starting before the first settles — nothing disables a row's delete button during a
 * widget's first (`force: false`) attempt, before any dialog is even showing, so two rapid deletes
 * race two independent `WIDGETS_REFERENCED` 409s. Not just cosmetic: confirming the dialog
 * force-purges whatever widget `pendingForcePurge` currently names, so the wrong widget could be
 * destroyed. See `purge`'s `purgeSettlement` doc comment.
 */
describe("useWidgetsLibrary — concurrent purge-attempt race safety", () => {
  const WIDGET_A: AdminWidget = { ...WIDGET, id: "wA", slug: "a", title: "A", status: "trash" };
  const WIDGET_B: AdminWidget = { ...WIDGET, id: "wB", slug: "b", title: "B", status: "trash" };

  it("two widgets' first purge attempts racing a WIDGETS_REFERENCED 409 must not let the wrong widget's dialog win", async () => {
    const deferred: Record<string, { reject: (e: unknown) => void }> = {};
    const port = createFakeWidgetsPort({ widgets: [WIDGET_A, WIDGET_B] });
    port.purgeWidget = vi.fn(({ id }: { id: string }) => {
      return new Promise<never>((_resolve, reject) => {
        deferred[id] = { reject };
      });
    });

    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.widgets).not.toBeNull());

    // Operator clicks "Delete permanently" on A (opens the confirm, no request yet), confirms it,
    // then immediately does the same on B — nothing disables either row before the first attempt's
    // 409 (if any) comes back.
    act(() => {
      void result.current.trashOrPurge(WIDGET_A);
    });
    act(() => {
      void result.current.confirmPurge();
    });
    act(() => {
      void result.current.trashOrPurge(WIDGET_B);
    });
    act(() => {
      void result.current.confirmPurge();
    });
    await waitFor(() => expect(port.purgeWidget).toHaveBeenCalledTimes(2));

    const referenced = (id: string) =>
      new ApiError("still referenced", 409, "WIDGETS_REFERENCED", {
        details: { referencingLocations: [{ kind: "post", entryId: id }] },
      });

    // B (clicked LAST) 409s first.
    await act(async () => {
      deferred.wB!.reject(referenced("post-for-b"));
    });
    await waitFor(() => expect(result.current.pendingForcePurge?.widget.id).toBe(WIDGET_B.id));

    // A's stale 409 now arrives.
    await act(async () => {
      deferred.wA!.reject(referenced("post-for-a"));
    });
    await waitFor(() => expect(result.current.pendingForcePurge?.widget.id).toBe(WIDGET_B.id));

    // The dialog must still be showing B — the operator's actual last click — not A's late 409.
    expect(result.current.pendingForcePurge?.widget.id).toBe(WIDGET_B.id);
  });
});

/**
 * #2 fix (2026-09-20): "Delete permanently" on a trashed widget used to purge immediately on
 * click — `trashOrPurge` called `purge()` directly, and the only dialog that existed
 * (`pendingForcePurge`) opened solely from a `WIDGETS_REFERENCED` 409. An unreferenced widget had
 * NO confirmation at all before its irreversible purge. `trashOrPurge` on a trashed widget now
 * opens `pendingPurge` and returns — `confirmPurge`/`cancelPurge` drive the actual request.
 */
describe("useWidgetsLibrary — permanent delete asks first", () => {
  const TRASHED: AdminWidget = { ...WIDGET, id: "w-trashed", slug: "trashed", title: "Trashed widget", status: "trash" };

  it("trashOrPurge on a trashed widget opens the confirm and sends nothing until confirmed", async () => {
    const port = createFakeWidgetsPort({ widgets: [TRASHED] });
    port.purgeWidget = vi.fn(port.purgeWidget);
    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.widgets).toHaveLength(1));

    await act(async () => {
      await result.current.trashOrPurge(TRASHED);
    });
    expect(port.purgeWidget).not.toHaveBeenCalled();
    expect(result.current.pendingPurge?.id).toBe(TRASHED.id);

    await act(async () => {
      await result.current.confirmPurge();
    });
    expect(port.purgeWidget).toHaveBeenCalledWith({ id: TRASHED.id }, { force: false });
    expect(result.current.pendingPurge).toBeNull();
    await waitFor(() => expect(result.current.widgets).toEqual([]));
  });

  it("cancelPurge closes the confirm with no request", async () => {
    const port = createFakeWidgetsPort({ widgets: [TRASHED] });
    port.purgeWidget = vi.fn(port.purgeWidget);
    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.widgets).toHaveLength(1));

    await act(async () => {
      await result.current.trashOrPurge(TRASHED);
    });
    expect(result.current.pendingPurge?.id).toBe(TRASHED.id);

    act(() => result.current.cancelPurge());
    expect(result.current.pendingPurge).toBeNull();
    expect(port.purgeWidget).not.toHaveBeenCalled();
  });

  it("a WIDGETS_REFERENCED 409 after confirming swaps the first dialog for 'Still in use' in one step", async () => {
    const port = createFakeWidgetsPort({
      widgets: [TRASHED],
      onPurge: (_id, options) => {
        if (!options.force) {
          throw new ApiError("still referenced", 409, "WIDGETS_REFERENCED", {
            details: { referencingLocations: [{ kind: "post", entryId: "p1" }] },
          });
        }
      },
    });
    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.widgets).toHaveLength(1));

    await act(async () => {
      await result.current.trashOrPurge(TRASHED);
    });
    await act(async () => {
      await result.current.confirmPurge();
    });

    expect(result.current.pendingPurge).toBeNull();
    expect(result.current.pendingForcePurge?.widget.id).toBe(TRASHED.id);
  });

  it("purging is true only while the confirmed purge is in flight", async () => {
    let resolvePurge: ((r: { purged: true }) => void) | undefined;
    const port = createFakeWidgetsPort({ widgets: [TRASHED] });
    port.purgeWidget = vi.fn(() => new Promise<{ purged: true }>((resolve) => (resolvePurge = resolve)));
    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.widgets).toHaveLength(1));

    await act(async () => {
      await result.current.trashOrPurge(TRASHED);
    });
    expect(result.current.purging).toBe(false);

    let confirmPromise!: Promise<void>;
    act(() => {
      confirmPromise = result.current.confirmPurge();
    });
    expect(result.current.purging).toBe(true);

    await act(async () => {
      resolvePurge?.({ purged: true });
      await confirmPromise;
    });
    expect(result.current.purging).toBe(false);
  });
});
