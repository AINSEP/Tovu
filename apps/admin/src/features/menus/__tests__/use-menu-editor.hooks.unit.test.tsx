import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminMenu } from "@/lib/api";
import { createFakeMenusPort } from "../hooks/menus-dependencies.hooks";
import { useMenuEditor } from "../hooks/use-menu-editor.hooks";

/**
 * @file `useMenuEditor` driven against the injected `MenusPort`, no `fetch` stub and no `api`
 * spy. `MenuEditor.tsx` has no component-level DI seam (unlike `Redirects.tsx`/`PageEditor.tsx`),
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
    // readable-slugs S6b: address bar after "New menu" reads the slug, not the raw id.
    expect(fakeNavigate).toHaveBeenCalledWith(`/menus/${port.menus[0]?.slug}`);
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
