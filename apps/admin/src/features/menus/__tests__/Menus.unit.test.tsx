import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Menus } from "../Menus";
import type { MenusController } from "../hooks/use-menus.hooks";

/**
 * @file `Menus` — pins the MSG-03 confirm-dialog swap: trashing an active menu still needs no
 * confirmation at all (unchanged); permanently deleting an already-trashed menu used to gate via
 * `window.confirm` and now gates via the shared `ConfirmDialog`, same copy.
 *
 * The "injected hook seam" describe block pins `MenusProps.useMenusHook` — the DI seam that
 * replaced this component's previous inline `useWiredMenus()` call.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ACTIVE_MENU = {
  id: "m1",
  workspaceId: "ws1",
  slug: "primary",
  title: "Primary nav",
  status: "published" as const,
  items: [],
  locations: [],
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

const TRASHED_MENU = { ...ACTIVE_MENU, id: "m2", title: "Old nav", status: "trash" as const };

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `Menus` now also reads `core.language.locale` (via `useAdminLocale`) to translate its own
  // chrome — a real `fetch` call this file's tests never queued for. Routed here, ahead of
  // `fetchMock`, so it never consumes a slot from the `mockResolvedValueOnce` sequence every test
  // below still queues on `fetchMock` itself unchanged. An empty settings response resolves
  // `loadLanguage()` to `DEFAULT_LOCALE` ("en"), matching every assertion below.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/settings/effective")) {
      return Promise.resolve(jsonResponse({ data: [] }));
    }
    return fetchMock(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Trash (non-force)", () => {
  it("needs no confirmation at all — matches the pre-existing behavior", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ menus: [ACTIVE_MENU] }))
      .mockResolvedValueOnce(jsonResponse({ menu: { ...ACTIVE_MENU, status: "trash" }, purged: false }))
      .mockResolvedValueOnce(jsonResponse({ menus: [] }));

    render(<Menus />);

    await user.click(await screen.findByRole("button", { name: /^trash$/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const trashCall = fetchMock.mock.calls[1];
    expect(trashCall[1]?.method).toBe("DELETE");
    expect(String(trashCall[0])).not.toContain("force=true");
  });
});

describe("Delete permanently (force, already-trashed)", () => {
  it("opens ConfirmDialog instead of window.confirm, and only force-deletes on explicit confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    fetchMock.mockResolvedValueOnce(jsonResponse({ menus: [TRASHED_MENU] }));

    render(<Menus />);

    await user.click(await screen.findByRole("button", { name: /delete permanently/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByText(/permanently delete "old nav"\? this cannot be undone\./i)).toBeInTheDocument();
    // Not deleted yet — only the GET so far.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ menu: null, purged: true }))
      .mockResolvedValueOnce(jsonResponse({ menus: [] }));

    await user.click(screen.getByRole("button", { name: /^permanently delete$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const deleteCall = fetchMock.mock.calls[1];
    expect(deleteCall[1]?.method).toBe("DELETE");
    expect(String(deleteCall[0])).toContain("force=true");
  });
});

describe("injected hook seam (useMenusHook)", () => {
  it("renders from a fake controller, proving the real hook is not hardcoded — no fetch involved", () => {
    const controller: MenusController = {
      menus: null,
      error: "fake controller error",
      pendingForceDelete: null,
      setPendingForceDelete: vi.fn(),
      forceDeleting: false,
      trashOrPurge: vi.fn(async () => {}),
      confirmForceDelete: vi.fn(async () => {}),
      t: (key) => key,
    };
    render(<Menus useMenusHook={() => controller} />);

    // The real hook never resolves an `error` before its first successful load — reaching this
    // exact state synchronously, before any fetch, is only possible via the injected fake.
    expect(screen.getByText("fake controller error")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
