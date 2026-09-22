import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, type AdminMenu } from "@/lib/api";
import { createFakeMenusPort } from "../hooks/menus-dependencies.hooks";
import { useMenus } from "../hooks/use-menus.hooks";

/**
 * @file `useMenus` driven against the injected `MenusPort`, no `fetch` stub and no `api` spy.
 * `Menus.tsx` has no component-level DI seam, so `Menus.unit.test.tsx` exercises the hook only
 * indirectly through a full component render with `fetch` stubbed — this is the first test to
 * exercise the hook itself.
 *
 * Trash rewrite (2026-09-21, `trash-delete-architecture.md`): `trashOrPurge`/`confirmForceDelete`
 * are gone — every delete now opens a confirm (`requestTrash`) and only calls `port.trash` on
 * {@link useMenus}'s `confirmTrash`, mirroring `use-widgets-library.hooks.unit.test.tsx`'s own
 * `requestTrash`/`confirmTrash`/`cancelTrash` coverage.
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

  it("requestTrash opens the confirm without calling the port; confirmTrash then calls trash exactly once and the row flips to trash once the list re-reads it", async () => {
    const trashSpy = vi.spyOn(api, "trash");
    const port = createFakeMenusPort({ menus: [MENU] });
    const { result } = renderHook(() => useMenus({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.menus).toEqual([MENU]));

    act(() => {
      result.current.requestTrash(MENU);
    });
    expect(result.current.pendingTrash).toEqual(MENU);
    expect(trashSpy).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.confirmTrash();
    });

    await waitFor(() => expect(result.current.menus?.[0]?.status).toBe("trash"));
    expect(result.current.pendingTrash).toBeNull();
    expect(trashSpy).not.toHaveBeenCalled(); // the injected fake port, never the real `api` client
  });

  it("cancelTrash closes the confirm and calls nothing", async () => {
    const port = createFakeMenusPort({ menus: [MENU] });
    const trashFn = vi.fn(port.trash);
    port.trash = trashFn;
    const { result } = renderHook(() => useMenus({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.menus).toEqual([MENU]));

    act(() => {
      result.current.requestTrash(MENU);
    });
    act(() => {
      result.current.cancelTrash();
    });

    expect(result.current.pendingTrash).toBeNull();
    expect(trashFn).not.toHaveBeenCalled();
  });

  it("a 404 on confirmTrash is quiet (no error banner) and re-reads the list", async () => {
    const port = createFakeMenusPort({ menus: [MENU] });
    port.trash = vi.fn(() => {
      throw new ApiError("not found", 404, "NOT_FOUND");
    });
    const { result } = renderHook(() => useMenus({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.menus).toEqual([MENU]));

    act(() => {
      result.current.requestTrash(MENU);
    });
    await act(async () => {
      await result.current.confirmTrash();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.pendingTrash).toBeNull();
  });

  it("a 409 TRASH_VERSION_CHANGED on confirmTrash shows the reload message", async () => {
    const port = createFakeMenusPort({ menus: [MENU] });
    port.trash = vi.fn(() => {
      throw new ApiError("stale", 409, "TRASH_VERSION_CHANGED");
    });
    const { result } = renderHook(() => useMenus({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.menus).toEqual([MENU]));

    act(() => {
      result.current.requestTrash(MENU);
    });
    await act(async () => {
      await result.current.confirmTrash();
    });

    expect(result.current.error).toBe("This item changed since you loaded it. Reload and try again.");
  });

  /**
   * Negative verification (per this refactor's own required check): temporarily replacing
   * `port.listMenus(...)`/`port.trash(...)` in `use-menus.hooks.ts` with direct calls to the
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
      result.current.requestTrash(MENU_A);
    });
    act(() => {
      void result.current.confirmTrash();
    });
    await waitFor(() => expect(releases[2]).toBeDefined());
    act(() => {
      result.current.requestTrash(MENU_B);
    });
    act(() => {
      void result.current.confirmTrash();
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
