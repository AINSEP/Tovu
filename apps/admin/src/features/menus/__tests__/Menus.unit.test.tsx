import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Menus } from "../Menus";
import type { MenusController } from "../hooks/use-menus.hooks";

/**
 * @file `Menus` — Trash rewrite (2026-09-21, `trash-delete-architecture.md`): every delete now
 * opens the shared `ConfirmDialog` ("Move to trash?") before calling `api.trash`; there is no more
 * force/purge ladder, since a trashed menu never reappears in this list (server-side default
 * filter). Matches the Widgets library delete precedent (46fa4e467) verbatim.
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

describe("Move to trash", () => {
  it("opens ConfirmDialog on click (not window.confirm), calls nothing until confirmed, then moves the menu to the Trash", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    fetchMock.mockResolvedValueOnce(jsonResponse({ menus: [ACTIVE_MENU] }));

    render(<Menus />);

    await user.click(await screen.findByRole("button", { name: /^trash$/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('Move "Primary nav" to trash?')).toBeInTheDocument();
    // Not trashed yet — only the initial GET so far.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true, version: 2 }))
      .mockResolvedValueOnce(jsonResponse({ menus: [] }));

    await user.click(screen.getByRole("button", { name: /^move to trash$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const trashCall = fetchMock.mock.calls[1];
    expect(trashCall[1]?.method).toBe("POST");
    expect(String(trashCall[0])).toContain("/trash/items");
    expect(JSON.parse(trashCall[1]?.body as string)).toEqual({ type: "menu", id: "m1" });
  });

  it("Cancel closes the dialog and calls nothing", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ menus: [ACTIVE_MENU] }));

    render(<Menus />);

    await user.click(await screen.findByRole("button", { name: /^trash$/i }));
    expect(await screen.findByText('Move "Primary nav" to trash?')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByText('Move "Primary nav" to trash?')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a 409 TRASH_VERSION_CHANGED response shows the reload message instead of trashing", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ menus: [ACTIVE_MENU] }));

    render(<Menus />);

    await user.click(await screen.findByRole("button", { name: /^trash$/i }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "changed", code: "TRASH_VERSION_CHANGED" }, 409),
    );

    await user.click(screen.getByRole("button", { name: /^move to trash$/i }));

    expect(await screen.findByText(/this item changed since you loaded it\. reload and try again\./i)).toBeInTheDocument();
  });
});

describe("Publish section button (plan-publish-sections-2026-09-25.md §2 S3)", () => {
  it("renders the section's own Publish menus button", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ menus: [ACTIVE_MENU] }));
    render(<Menus />);
    expect(await screen.findByRole("button", { name: "Publish menus" })).toBeInTheDocument();
  });
});

describe("injected hook seam (useMenusHook)", () => {
  it("renders from a fake controller, proving the real hook is not hardcoded — no fetch involved", () => {
    const controller: MenusController = {
      menus: null,
      error: "fake controller error",
      pendingTrash: null,
      trashing: false,
      requestTrash: vi.fn(),
      confirmTrash: vi.fn(async () => {}),
      cancelTrash: vi.fn(),
      t: (key) => key,
    };
    render(<Menus useMenusHook={() => controller} />);

    // The real hook never resolves an `error` before its first successful load — reaching this
    // exact state synchronously, before any fetch, is only possible via the injected fake.
    expect(screen.getByText("fake controller error")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // readable-slugs S6b (2026-09-23): the list row links by slug, not the raw id — same rule
  // Posts/Pages/Widgets rows already follow.
  it("links a menu row by its slug, not its id", () => {
    const controller: MenusController = {
      menus: [ACTIVE_MENU],
      error: null,
      pendingTrash: null,
      trashing: false,
      requestTrash: vi.fn(),
      confirmTrash: vi.fn(async () => {}),
      cancelTrash: vi.fn(),
      t: (key) => key,
    };
    render(<Menus useMenusHook={() => controller} />);

    const link = screen.getByRole("link", { name: "Primary nav" });
    expect(link).toHaveAttribute("href", "/admin/menus/primary");
  });
});
