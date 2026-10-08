import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, type AdminMenu } from "@/lib/api";
import { VERSION_CONFLICT_MESSAGE } from "@/lib/version-conflict";
import { createFakeMenusPort } from "../hooks/menus-dependencies.hooks";
import { useMenuEditor } from "../hooks/use-menu-editor.hooks";

/**
 * @file `useMenuEditor` driven against the injected `MenusPort`, no `fetch` stub and no `api`
 * spy. `MenuEditor.tsx` has no component-level DI seam (unlike `Jini redirects/react/pages/RedirectsPage.tsx`/`PageEditor.tsx`),
 * so `MenuEditor.unit.test.tsx` exercises the hook only indirectly through a full component
 * render with `fetch` stubbed — this is the first test to exercise the hook itself.
 */

const MENU: AdminMenu = {
  id: "m1",
  workspaceId: "ws1",
  slug: "main",
  title: "Main menu",
  status: "draft",
  items: [{ id: "i1", label: "Home", target: { kind: "url", href: "/" } }],
  locations: [],
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMenuEditor — injected port (no fetch stub, no api spy)", () => {
  it("loads an existing menu from the injected port and never touches the real api client", async () => {
    const getSpy = vi.spyOn(api, "getMenu");
    const port = createFakeMenusPort({ menus: [MENU] });
    const { result } = renderHook(() => useMenuEditor("m1", { port, navigate: vi.fn(), t: (k) => k }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.title).toBe("Main menu");
    expect(result.current.items).toEqual(MENU.items);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("appends children and roots without replacing existing items or the other parent", async () => {
    const child = { id: "child", label: "Child", target: { kind: "url" as const, href: "/child" } };
    const parent = { ...MENU.items[0]!, children: [child] };
    const other = { ...MENU.items[0]!, id: "other", children: [child] };
    const port = createFakeMenusPort({ menus: [{ ...MENU, items: [parent, other] }] });
    const { result } = renderHook(() => useMenuEditor("m1", { port, navigate: vi.fn(), t: (k) => k }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.addChildAt([0]));
    expect(result.current.items[0]?.children).toHaveLength(2);
    expect(result.current.items[0]?.children?.[0]).toEqual(child);
    expect(result.current.items[0]?.children?.[1]).toEqual({ id: expect.any(String), label: "", target: { kind: "url", href: "" } });
    expect(result.current.items[1]).toEqual(other);
    const existing = result.current.items;
    act(() => result.current.addRootItem());
    expect(result.current.items).toHaveLength(3);
    expect(result.current.items.slice(0, 2)).toEqual(existing);
    expect(result.current.items[2]).toEqual({ id: expect.any(String), label: "", target: { kind: "url", href: "" } });
  });

  it.each([new Error("Load denied"), "unknown failure"])("surfaces a load rejection and clears loading (%s)", async (failure) => {
    const port = createFakeMenusPort();
    port.getMenu = vi.fn().mockRejectedValue(failure);
    const { result } = renderHook(() => useMenuEditor("m1", { port, navigate: vi.fn(), t: (k) => k }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(failure instanceof Error ? failure.message : "failed to load menu");
    expect(result.current.menu).toBeNull();
    expect(result.current.message).toBeNull();
  });

  it("reports save failure without success and keeps unsaved edits dirty", async () => {
    const port = createFakeMenusPort({ menus: [MENU] });
    port.updateMenuTree = vi.fn().mockRejectedValue(new Error("Version conflict"));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useMenuEditor("m1", { port, navigate: vi.fn(), t: (k) => k }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setTitle("Renamed"));
    await act(async () => { await result.current.save(); });
    expect(result.current.error).toBe("Version conflict");
    expect(result.current.message).toBeNull();
    expect(result.current.saving).toBe(false);
    expect(result.current.menu?.version).toBe(1);
    expect(result.current.confirmLeave()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("shows the translated conflict copy, not the raw server message, when a save loses the compare-and-set", async () => {
    const port = createFakeMenusPort({ menus: [MENU] });
    port.updateMenuTree = vi.fn().mockRejectedValue(
      new ApiError("menu 'm1' was modified concurrently (expected version 1, found 2)", 409, "VERSION_CONFLICT")
    );
    const t = (key: string) => (key === VERSION_CONFLICT_MESSAGE ? "TRANSLATED CONFLICT" : key);
    const { result } = renderHook(() => useMenuEditor("m1", { port, navigate: vi.fn(), t }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.save(); });
    expect(result.current.error).toBe("TRANSLATED CONFLICT");
    expect(result.current.menu?.version).toBe(1);
  });

  it("keeps the server message for a code-less 409 (slug already taken)", async () => {
    const port = createFakeMenusPort({ menus: [MENU] });
    port.updateMenuTree = vi.fn().mockRejectedValue(new ApiError("slug 'main' already exists", 409));
    const { result } = renderHook(() => useMenuEditor("m1", { port, navigate: vi.fn(), t: () => "TRANSLATED" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.save(); });
    expect(result.current.error).toBe("slug 'main' already exists");
  });

  it("falls back to 'save failed' when the save rejects with a non-Error value", async () => {
    const port = createFakeMenusPort({ menus: [MENU] });
    port.updateMenuTree = vi.fn().mockRejectedValue("boom");
    const { result } = renderHook(() => useMenuEditor("m1", { port, navigate: vi.fn(), t: (k) => k }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.save(); });
    expect(result.current.error).toBe("save failed");
  });

  it("saves the edited metadata and tree with the loaded version, then re-baselines the dirty guard", async () => {
    const port = createFakeMenusPort({ menus: [MENU] });
    const update = vi.spyOn(port, "updateMenuTree");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useMenuEditor("m1", { port, navigate: vi.fn(), t: (k) => k }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setTitle("Renamed");
      result.current.setSlug("renamed-menu");
      result.current.changeAt([0], (item) => ({ ...item, label: "Start" }));
    });
    expect(result.current.confirmLeave()).toBe(false);
    confirm.mockClear();
    const items = result.current.items;
    await act(async () => { await result.current.save(); });
    expect(update).toHaveBeenCalledExactlyOnceWith(
      { id: "m1", expectedVersion: 1, items },
      { title: "Renamed", slug: "renamed-menu" }
    );
    expect(result.current.message).toBe("Saved · version 2");
    expect(result.current.error).toBeNull();
    expect(result.current.confirmLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();

    // The next update must use the newly saved version too.
    await act(async () => { await result.current.save(); });
    expect(update).toHaveBeenLastCalledWith(
      { id: "m1", expectedVersion: 2, items },
      { title: "Renamed", slug: "renamed-menu" }
    );
  });

  it("routes create through the injected port and calls the injected navigate, never the real router", async () => {
    const createSpy = vi.spyOn(api, "createMenu");
    const port = createFakeMenusPort();
    const fakeNavigate = vi.fn();
    const { result } = renderHook(() => useMenuEditor(null, { port, navigate: fakeNavigate, t: (k) => k }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setTitle("New menu"));
    act(() => result.current.setSlug("new-menu"));
    await act(async () => {
      await result.current.save();
    });

    expect(port.menus).toHaveLength(1);
    expect(port.menus[0]?.title).toBe("New menu");
    expect(port.menus[0]?.slug).toBe("new-menu");
    // readable-slugs S6b: address bar after "New menu" reads the slug, not the raw id.
    expect(fakeNavigate).toHaveBeenCalledWith(`/menus/${port.menus[0]?.slug}`);
    expect(fakeNavigate).toHaveBeenCalledWith("/menus/new-menu");
    expect(createSpy).not.toHaveBeenCalled();
  });

  /**
   * Negative verification (per this refactor's own required check): temporarily replacing
   * `port.getMenu(...)`/`port.createMenu(...)`/`navigate(...)` in `use-menu-editor.hooks.ts` with
   * direct calls to the real `api`/`lib/router` imports and re-running this suite fails both
   * assertions above (no real network in this test env) — see this feature's commit/handoff report
   * for the recorded run.
   */
  it("stays loading while the injected port's get call is still pending", () => {
    const port = createFakeMenusPort();
    port.getMenu = () => new Promise(() => {});
    const { result } = renderHook(() => useMenuEditor("m1", { port, navigate: vi.fn(), t: (k) => k }));
    expect(result.current.loading).toBe(true);
    expect(result.current.menu).toBeNull();
  });

  it("ignores an older getMenu response that arrives after the next menu has loaded", async () => {
    const menuB: AdminMenu = { ...MENU, id: "m2", title: "Menu B", slug: "menu-b", items: [] };
    const port = createFakeMenusPort();
    let resolveA!: (value: { menu: AdminMenu }) => void;
    let resolveB!: (value: { menu: AdminMenu }) => void;
    const pendingA = new Promise<{ menu: AdminMenu }>((resolve) => { resolveA = resolve; });
    const pendingB = new Promise<{ menu: AdminMenu }>((resolve) => { resolveB = resolve; });
    port.getMenu = (id) => id === "m1" ? pendingA : pendingB;
    const navigate = vi.fn();
    const { result, rerender } = renderHook(
      ({ id }) => useMenuEditor(id, { port, navigate, t: (k) => k }),
      { initialProps: { id: "m1" } }
    );
    rerender({ id: "m2" });
    expect(result.current.loading).toBe(true);
    await act(async () => { resolveB({ menu: menuB }); await pendingB; });
    expect(result.current.loading).toBe(false);
    expect(result.current.title).toBe("Menu B");
    await act(async () => { resolveA({ menu: MENU }); await pendingA; });
    expect(result.current.menu).toEqual(menuB);
    expect(result.current.title).toBe("Menu B");
    expect(result.current.slug).toBe("menu-b");
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  /**
   * Stale-response race, save() half (2026-08-12 audit finding): clicking Save on menu A, then
   * navigating to menu B before `updateMenuTree` resolves, must not let A's (now-stale) response
   * overwrite B's state — that would silently show A's saved title/items under B's URL, and a
   * SECOND save from there would then write to the wrong record (`menu.id` would still read A's
   * id). Negatively verified per this fix's own commit: reverting the `activeMenuIdRef` guard in
   * `save()` (restoring the pre-fix body) makes this test fail — `title`/`items` end up A's
   * post-save values instead of B's.
   */
  it("does not let a stale updateMenuTree response (for a menu navigated away from while saving) overwrite the currently-viewed menu", async () => {
    const MENU_A: AdminMenu = { ...MENU, id: "menu-a", title: "Menu A", version: 2 };
    const MENU_B: AdminMenu = {
      ...MENU,
      id: "menu-b",
      title: "Menu B",
      version: 7,
      items: [{ id: "i2", label: "About", target: { kind: "url", href: "/about" } }],
    };
    const port = createFakeMenusPort({ menus: [MENU_A, MENU_B] });

    let resolveSaveA!: (value: { menu: AdminMenu }) => void;
    const pendingSaveA = new Promise<{ menu: AdminMenu }>((resolve) => {
      resolveSaveA = resolve;
    });
    port.updateMenuTree = (target) => (target.id === "menu-a" ? pendingSaveA : Promise.reject(new Error("unexpected updateMenuTree call")));

    const { result, rerender } = renderHook(
      (props: { menuId: string }) => useMenuEditor(props.menuId, { port, navigate: vi.fn(), t: (k) => k }),
      { initialProps: { menuId: "menu-a" } }
    );
    await waitFor(() => expect(result.current.title).toBe("Menu A"));

    // Click Save on menu A — updateMenuTree("menu-a") is now in flight.
    act(() => {
      void result.current.save();
    });

    // Navigate to menu B before A's save resolves.
    rerender({ menuId: "menu-b" });
    await waitFor(() => expect(result.current.title).toBe("Menu B"));

    // Resolve A's save last — the exact out-of-order arrival a slow connection can produce.
    await act(async () => {
      resolveSaveA({ menu: { ...MENU_A, version: 3, title: "Menu A edited after navigating away" } });
      await Promise.resolve();
    });

    expect(result.current.menu?.id).toBe("menu-b");
    expect(result.current.title).toBe("Menu B");
    expect(result.current.items).toEqual(MENU_B.items);
    expect(result.current.message).toBeNull();
  });

  /**
   * S4a (sink of M4, 2026-09-20) — the Save button had no `disabled` at all, so a double click sent
   * two `updateMenuTree` calls carrying the same (now-stale-by-the-second-call) `expectedVersion`.
   * Today there is no re-entry guard, so both same-tick calls reach the port — this is RED.
   */
  it("saving is true while a save is in flight, and two same-tick save() calls reach updateMenuTree only once", async () => {
    let updateCalls = 0;
    let resolveSave!: () => void;
    const port = createFakeMenusPort({ menus: [MENU] });
    port.updateMenuTree = () => {
      updateCalls += 1;
      return new Promise((resolve) => {
        resolveSave = () => resolve({ menu: { ...MENU, version: MENU.version + 1, title: "Renamed" } });
      });
    };
    const { result } = renderHook(() => useMenuEditor("m1", { port, navigate: vi.fn(), t: (k) => k }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setTitle("Renamed"));
    expect(result.current.saving).toBe(false);

    act(() => {
      void result.current.save();
      void result.current.save();
    });

    expect(result.current.saving).toBe(true);
    expect(updateCalls).toBe(1);

    await act(async () => {
      resolveSave();
      await Promise.resolve();
    });

    expect(result.current.saving).toBe(false);
  });
});

// readable-slugs S6b (2026-09-23): an old id-based bookmark quietly catches up to the slug URL,
// same `slugRedirectPath` (`lib/slug-redirect-path.ts`) rule posts/pages/widgets already apply.
describe("useMenuEditor — slug redirect on load", () => {
  const MENU_UUID = "b7e6c8a0-1f2d-4e3a-9c5b-6a7d8e9f0a1b";

  it("replace-navigates to the slug URL when menuId is the menu's raw (UUID-shaped) id", async () => {
    const port = createFakeMenusPort({ menus: [{ ...MENU, id: MENU_UUID, slug: "hello-menu" }] });
    const navigate = vi.fn();
    const { result } = renderHook(() => useMenuEditor(MENU_UUID, { port, navigate, t: (k) => k }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(navigate).toHaveBeenCalledWith("/menus/hello-menu", { replace: true });
  });

  it("does not navigate when menuId already IS the menu's slug", async () => {
    const port = createFakeMenusPort({ menus: [MENU] });
    const navigate = vi.fn();
    const { result } = renderHook(() => useMenuEditor(MENU.slug, { port, navigate, t: (k) => k }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(navigate).not.toHaveBeenCalled();
  });
});
