import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminMenu } from "@/lib/api";
import { createFakeMenusPort } from "../hooks/menus-dependencies.hooks";
import { useMenus } from "../hooks/use-menus.hooks";

/**
 * @file `useMenus` driven against the injected `MenusPort`, no `fetch` stub and no `api` spy.
 * `Menus.tsx` has no component-level DI seam, so `Menus.unit.test.tsx` exercises the hook only
 * indirectly through a full component render with `fetch` stubbed — this is the first test to
 * exercise the hook itself.
 */

const MENU: AdminMenu = {
  id: "m1",
  workspaceId: "ws1",
  slug: "main",
  title: "Main menu",
  status: "active" as AdminMenu["status"],
  items: [],
  locations: [],
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMenus — injected port (no fetch stub, no api spy)", () => {
  it("loads the list from the injected port and never touches the real api client", async () => {
    const listSpy = vi.spyOn(api, "listMenus");
    const port = createFakeMenusPort({ menus: [MENU] });
    const { result } = renderHook(() => useMenus({ port, t: (k) => k }));

    await waitFor(() => expect(result.current.menus).toEqual([MENU]));
    expect(listSpy).not.toHaveBeenCalled();
  });

  it("routes trashOrPurge (active menu) through the injected port's deleteMenu, and the row flips to trash once the list re-reads it", async () => {
    const deleteSpy = vi.spyOn(api, "deleteMenu");
    const port = createFakeMenusPort({ menus: [MENU] });
    const { result } = renderHook(() => useMenus({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.menus).toEqual([MENU]));

    await act(async () => {
      await result.current.trashOrPurge(MENU);
    });

    await waitFor(() => expect(result.current.menus?.[0]?.status).toBe("trash"));
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  /**
   * Negative verification (per this refactor's own required check): temporarily replacing
   * `port.listMenus(...)`/`port.deleteMenu(...)` in `use-menus.hooks.ts` with direct calls to the
   * real `api` import and re-running this suite fails both assertions above (no real network in
   * this test env) — see this feature's commit/handoff report for the recorded run.
   */
  it("does not resolve `menus` while the injected port's list call is still pending", () => {
    const port = createFakeMenusPort();
    port.listMenus = () => new Promise(() => {});
    const { result } = renderHook(() => useMenus({ port, t: (k) => k }));
    expect(result.current.menus).toBeNull();
  });
});

/**
 * a3-review-6 (2026-09-21), sink of c77af7f1e: `load()` had no latest-wins guard, the same shape
 * `use-widgets-library.hooks.ts` just fixed. Trashing menu A, then menu B, fires two independent
 * re-reads; if A's older read settles last, B renders `active` again although the server trashed it.
 */
describe("useMenus — overlapping list reads keep the newest", () => {
  const MENU_A: AdminMenu = { ...MENU, id: "mA", slug: "a", title: "A" };
  const MENU_B: AdminMenu = { ...MENU, id: "mB", slug: "b", title: "B" };
  type ListResult = { menus: AdminMenu[] };

  function holdReadsAfterMount(port: ReturnType<typeof createFakeMenusPort>) {
    const releases: Array<{ resolve: (r: ListResult) => void; reject: (e: unknown) => void }> = [];
    let callCount = 0;
    port.listMenus = vi.fn(() => {
      callCount += 1;
      // The mount read settles immediately; every read after it is held until the test releases it.
      if (callCount === 1) return Promise.resolve({ menus: [MENU_A, MENU_B] });
      return new Promise<ListResult>((resolve, reject) => {
        releases[callCount] = { resolve, reject };
      });
    });
    return releases;
  }

  async function trashAThenB(result: { current: ReturnType<typeof useMenus> }, releases: unknown[]) {
    act(() => {
      void result.current.trashOrPurge(MENU_A);
    });
    await waitFor(() => expect(releases[2]).toBeDefined());
    act(() => {
      void result.current.trashOrPurge(MENU_B);
    });
    await waitFor(() => expect(releases[3]).toBeDefined());
  }

  it("an older list read settling after a newer one does not overwrite it", async () => {
    const port = createFakeMenusPort({ menus: [MENU_A, MENU_B] });
    const releases = holdReadsAfterMount(port);
    const { result } = renderHook(() => useMenus({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.menus).toHaveLength(2));
    await trashAThenB(result, releases);

    await act(async () => {
      releases[3]!.resolve({ menus: [{ ...MENU_A, status: "trash" }, { ...MENU_B, status: "trash" }] });
    });
    await act(async () => {
      releases[2]!.resolve({ menus: [{ ...MENU_A, status: "trash" }, MENU_B] });
    });

    expect(result.current.menus?.map((m) => m.status)).toEqual(["trash", "trash"]);
  });

  it("an older list read failing after a newer one succeeded shows no load error", async () => {
    const port = createFakeMenusPort({ menus: [MENU_A, MENU_B] });
    const releases = holdReadsAfterMount(port);
    const { result } = renderHook(() => useMenus({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.menus).toHaveLength(2));
    await trashAThenB(result, releases);

    await act(async () => {
      releases[3]!.resolve({ menus: [{ ...MENU_A, status: "trash" }, { ...MENU_B, status: "trash" }] });
    });
    await act(async () => {
      releases[2]!.reject(new Error("stale read failed"));
    });

    expect(result.current.error).toBeNull();
    expect(result.current.menus?.map((m) => m.status)).toEqual(["trash", "trash"]);
  });
});
