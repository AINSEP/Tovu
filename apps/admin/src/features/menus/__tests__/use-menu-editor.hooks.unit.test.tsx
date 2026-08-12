import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminMenu } from "../../../lib/api";
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
    const { result } = renderHook(() => useMenuEditor("m1", { port, navigate: vi.fn() }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.title).toBe("Main menu");
    expect(result.current.items).toEqual(MENU.items);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("routes create through the injected port and calls the injected navigate, never the real router", async () => {
    const createSpy = vi.spyOn(api, "createMenu");
    const port = createFakeMenusPort();
    const fakeNavigate = vi.fn();
    const { result } = renderHook(() => useMenuEditor(null, { port, navigate: fakeNavigate }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setTitle("New menu"));
    act(() => result.current.setSlug("new-menu"));
    await act(async () => {
      await result.current.save();
    });

    expect(port.menus).toHaveLength(1);
    expect(port.menus[0]?.title).toBe("New menu");
    expect(fakeNavigate).toHaveBeenCalledWith(`/menus/${port.menus[0]?.id}`);
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
    const { result } = renderHook(() => useMenuEditor("m1", { port, navigate: vi.fn() }));
    expect(result.current.loading).toBe(true);
    expect(result.current.menu).toBeNull();
  });
});
