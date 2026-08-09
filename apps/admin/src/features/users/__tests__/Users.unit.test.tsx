import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Users } from "../Users";

/**
 * @file `Users` — pins the `RowMenu` rollout (task: roll `RowMenu` out to `Users.tsx`/
 * `Members.tsx`). Corrected spec (superseding an earlier "Manage stays a visible button" hybrid
 * design): the three-dot `RowMenu` holds Disable/Enable, Manage, and Reset password, matching
 * `Posts.tsx`/`Pages.tsx`'s row-action shape — no separate button survives in that column. There
 * is no Delete item: no server-side route deletes a user principal.
 *
 * Disable keeps its existing confirm-gate, now via the shared `ConfirmDialog` (a `RowMenu` item
 * has no in-place two-click affordance the old `ConfirmButton` used) instead of losing the
 * protection outright. Reset password moves out of the expanded "Manage" panel entirely, into its
 * own dialog with an embedded password field. "Manage" keeps a static label rather than
 * alternating with "Close" — see `Users.tsx`'s `rowMenuItems` doc comment for why.
 *
 * `ConfirmDialog` stays mounted unconditionally and toggles its own `open` attribute (its own doc
 * comment) — its `<h2>` title text is therefore always in the DOM regardless of open/closed state,
 * so "is the dialog showing" has to be asserted via the `<dialog open>` attribute, not text
 * presence. Same pattern `PostEditor.unit.test.tsx` already uses for its own delete `ConfirmDialog`.
 * Follows the RTL harness `MenuEditor.unit.test.tsx`/`Comments.unit.test.tsx` established for this
 * package's `RowMenu` screens.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ACTIVE_USER = {
  principalId: "u1",
  workspaceId: "w1",
  username: "alice",
  email: "alice@example.com",
  status: "active" as const,
  createdAt: "2026-08-01T00:00:00.000Z",
  roleIds: [],
  policyIds: [],
};

const DISABLED_USER = { ...ACTIVE_USER, principalId: "u2", username: "bob", status: "disabled" as const };

let fetchMock: ReturnType<typeof vi.fn>;

/** Finds the `<dialog>` whose own heading matches `titleRe` — there are two `ConfirmDialog`s
 *  mounted on this screen (Disable, Reset password), both always in the DOM. */
function dialogFor(titleRe: RegExp): HTMLElement {
  return screen.getByText(titleRe).closest("dialog") as HTMLElement;
}

beforeEach(() => {
  fetchMock = vi.fn();
  // `Users` now also calls `useAdminLocale()` (real `fetch`, not this screen's own concern), which
  // would otherwise consume one of this file's strictly-ordered `mockResolvedValueOnce` slots and
  // shift every later assertion by one call. Routed to a fixed default-locale response outside
  // `fetchMock`'s own call queue, so `fetchMock.mock.calls` still holds exactly this screen's own
  // requests, in the order each test already expects.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return fetchMock(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openMenu(user: ReturnType<typeof userEvent.setup>, username: string) {
  await user.click(screen.getByRole("button", { name: `Actions for user "${username}"` }));
  return screen.getByRole("menu");
}

describe("Manage — moved into the RowMenu, per the corrected spec (no standalone button)", () => {
  it("has no standalone Manage button; the menu item opens the expanded panel", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<Users />);

    await screen.findByText("alice");
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();

    const menu = await openMenu(user, "alice");
    expect(within(menu).getByRole("menuitem", { name: "Manage" })).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "Manage" }));

    // Scoped to the panel itself — the reset-password `ConfirmDialog` stays mounted elsewhere in
    // the DOM regardless of open state (its own doc comment), so its "Reset password" confirm
    // button would otherwise be found unscoped even though it isn't part of this panel.
    const panel = screen.getByText("Assign role").closest(".integrations-form") as HTMLElement;
    expect(panel).toBeInTheDocument();
    // Reset password no longer lives in this panel — it moved into the RowMenu.
    expect(within(panel).queryByText(/reset password/i)).not.toBeInTheDocument();
  });

  it("selecting Manage a second time closes the panel again (still a toggle, just a static label)", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<Users />);

    await screen.findByText("alice");
    await user.click(within(await openMenu(user, "alice")).getByRole("menuitem", { name: "Manage" }));
    expect(screen.getByText("Assign role")).toBeInTheDocument();

    // The menu item's label never becomes "Close" (it would only ever describe a state the
    // operator can't see, since the menu itself is gone the instant it's selected) — reopening
    // the menu still shows "Manage", and selecting it again still closes the panel.
    const menuAgain = await openMenu(user, "alice");
    expect(within(menuAgain).getByRole("menuitem", { name: "Manage" })).toBeInTheDocument();
    expect(within(menuAgain).queryByRole("menuitem", { name: "Close" })).not.toBeInTheDocument();
    await user.click(within(menuAgain).getByRole("menuitem", { name: "Manage" }));

    expect(screen.queryByText("Assign role")).not.toBeInTheDocument();
  });
});

describe("Username link — a second affordance for the same Manage behavior", () => {
  it("is a real focusable button (not a bare anchor), named by the username itself", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<Users />);

    const usernameLink = await screen.findByRole("button", { name: "alice" });
    expect(usernameLink.tagName).toBe("BUTTON");
    expect(usernameLink).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking it opens the same panel the RowMenu's Manage item opens, and toggles aria-expanded", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<Users />);

    const usernameLink = await screen.findByRole("button", { name: "alice" });
    expect(screen.queryByText("Assign role")).not.toBeInTheDocument();

    await user.click(usernameLink);

    expect(screen.getByText("Assign role")).toBeInTheDocument();
    expect(usernameLink).toHaveAttribute("aria-expanded", "true");

    // Same handler, either direction: clicking it again closes the panel it opened.
    await user.click(usernameLink);
    expect(screen.queryByText("Assign role")).not.toBeInTheDocument();
    expect(usernameLink).toHaveAttribute("aria-expanded", "false");
  });

  it("opening via the RowMenu's Manage item and closing via the username link both drive the same state", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<Users />);

    await screen.findByText("alice");
    const menu = await openMenu(user, "alice");
    await user.click(within(menu).getByRole("menuitem", { name: "Manage" }));

    const usernameLink = screen.getByRole("button", { name: "alice" });
    expect(usernameLink).toHaveAttribute("aria-expanded", "true");

    await user.click(usernameLink);
    expect(screen.queryByText("Assign role")).not.toBeInTheDocument();
    expect(usernameLink).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Disable — via RowMenu, still confirm-gated", () => {
  it("opens a ConfirmDialog instead of acting immediately, and only disables on confirm", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] })) // initial load
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }))
      .mockResolvedValueOnce(jsonResponse({ user: { ...ACTIVE_USER, status: "disabled" } })) // POST disable
      .mockResolvedValueOnce(jsonResponse({ users: [{ ...ACTIVE_USER, status: "disabled" }] })) // reload
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<Users />);

    await screen.findByText("alice");
    const menu = await openMenu(user, "alice");
    await user.click(within(menu).getByRole("menuitem", { name: "Disable" }));

    const dialog = dialogFor(/disable this user\?/i);
    expect(dialog).toHaveAttribute("open");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/disable"))).toBe(false);

    // The dialog's own "Disable" confirm button, not the RowMenu item of the same name.
    await user.click(within(dialog).getByRole("button", { name: /^disable$/i }));

    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/disable"))).toBe(true);
    await screen.findByText("disabled");
    expect(dialog).not.toHaveAttribute("open");
  });

  it("Cancel closes the dialog without disabling — UserDisableDialog's onCancel branch", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<Users />);

    await screen.findByText("alice");
    const menu = await openMenu(user, "alice");
    await user.click(within(menu).getByRole("menuitem", { name: "Disable" }));

    const dialog = dialogFor(/disable this user\?/i);
    expect(dialog).toHaveAttribute("open");
    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    expect(dialog).not.toHaveAttribute("open");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/disable"))).toBe(false);
    expect(screen.getByText("active")).toBeInTheDocument();
  });
});

describe("Enable — via RowMenu, immediate (no confirm, matching prior behavior)", () => {
  it("fires immediately with no dialog", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [DISABLED_USER] })) // initial load
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }))
      .mockResolvedValueOnce(jsonResponse({ user: { ...DISABLED_USER, status: "active" } })) // POST enable
      .mockResolvedValueOnce(jsonResponse({ users: [{ ...DISABLED_USER, status: "active" }] })) // reload
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<Users />);

    await screen.findByText("bob");
    const menu = await openMenu(user, "bob");
    await user.click(within(menu).getByRole("menuitem", { name: "Enable" }));

    // No dialog opened for Enable — the "Disable" dialog stays mounted-but-closed, same as before
    // this interaction even started.
    expect(dialogFor(/disable this user\?/i)).not.toHaveAttribute("open");
    expect(await screen.findByText("active")).toBeInTheDocument();
  });
});

describe("Reset password — via RowMenu, opens a dialog with a password field", () => {
  it("submits the typed password and shows a success notice", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] })) // initial load
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }))
      .mockResolvedValueOnce(jsonResponse({})); // POST reset-password (void response)
    render(<Users />);

    await screen.findByText("alice");
    const menu = await openMenu(user, "alice");
    await user.click(within(menu).getByRole("menuitem", { name: "Reset password" }));

    const dialog = dialogFor(/reset password\?/i);
    expect(dialog).toHaveAttribute("open");
    await user.type(within(dialog).getByLabelText("New password"), "correct-horse-battery-staple");
    await user.click(within(dialog).getByRole("button", { name: /^reset password$/i }));

    expect(await screen.findByText(/password reset for "alice"/i)).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute("open");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/reset-password"))).toBe(true);
  });

  it("keeps the dialog open and shows the error on failure, preserving the typed password", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "server exploded" }, 500));
    render(<Users />);

    await screen.findByText("alice");
    const menu = await openMenu(user, "alice");
    await user.click(within(menu).getByRole("menuitem", { name: "Reset password" }));

    const dialog = dialogFor(/reset password\?/i);
    const input = within(dialog).getByLabelText("New password") as HTMLInputElement;
    await user.type(input, "correct-horse-battery-staple");
    await user.click(within(dialog).getByRole("button", { name: /^reset password$/i }));

    await screen.findByText("server exploded");
    expect(dialog).toHaveAttribute("open");
    expect(input.value).toBe("correct-horse-battery-staple");
  });

  it("Cancel closes the dialog and clears the typed password and error — UserResetPasswordDialog's onCancel branch", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "server exploded" }, 500));
    render(<Users />);

    await screen.findByText("alice");
    const menu = await openMenu(user, "alice");
    await user.click(within(menu).getByRole("menuitem", { name: "Reset password" }));

    const dialog = dialogFor(/reset password\?/i);
    await user.type(within(dialog).getByLabelText("New password"), "correct-horse-battery-staple");
    await user.click(within(dialog).getByRole("button", { name: /^reset password$/i }));
    await screen.findByText("server exploded");

    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    expect(dialog).not.toHaveAttribute("open");
    expect(screen.queryByText("server exploded")).not.toBeInTheDocument();
    // Reopening starts from a clean slate — proves newPassword/passwordError were actually
    // cleared by onCancel, not merely hidden behind the closed dialog.
    await user.click(within(await openMenu(user, "alice")).getByRole("menuitem", { name: "Reset password" }));
    expect((within(dialog).getByLabelText("New password") as HTMLInputElement).value).toBe("");
  });
});
