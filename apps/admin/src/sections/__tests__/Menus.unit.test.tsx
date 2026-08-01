import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Menus } from "../Menus";

/**
 * @file `Menus` — pins the MSG-03 confirm-dialog swap: trashing an active menu still needs no
 * confirmation at all (unchanged); permanently deleting an already-trashed menu used to gate via
 * `window.confirm` and now gates via the shared `ConfirmDialog`, same copy.
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

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
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
