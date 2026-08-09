import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Members } from "../Members";

/**
 * @file `Members` — pins the `RowMenu` rollout (task: roll `RowMenu` out to `Users.tsx`/
 * `Members.tsx`). Unlike `Users.tsx` (a hybrid, since its "Manage" toggles a panel rather than
 * performing an action), Members has no such carve-out — both row actions (Disable, Resend
 * sign-in link) move fully into the menu. "Disable" is omitted from the menu once a member is
 * already disabled (`RowMenu` has no per-item `disabled` — Posts.tsx's own precedent is to omit
 * an inapplicable action rather than render it as a no-op).
 *
 * `ConfirmDialog` stays mounted unconditionally and toggles its own `open` attribute (its own doc
 * comment) — its `<h2>` title text is therefore always in the DOM regardless of open/closed
 * state, so "is the dialog showing" is asserted via the `<dialog open>` attribute, same pattern
 * `PostEditor.unit.test.tsx` uses for its own delete `ConfirmDialog`. Follows the RTL harness
 * `MenuEditor.unit.test.tsx`/`Comments.unit.test.tsx` established for this package's `RowMenu`
 * screens.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ACTIVE_MEMBER = {
  id: "m1",
  workspaceId: "w1",
  email: "alice@example.com",
  name: "Alice",
  status: "active" as const,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

const DISABLED_MEMBER = { ...ACTIVE_MEMBER, id: "m2", email: "bob@example.com", name: "Bob", status: "disabled" as const };

let fetchMock: ReturnType<typeof vi.fn>;

/** Finds the `<dialog>` whose own heading matches `titleRe`. */
function dialogFor(titleRe: RegExp): HTMLElement {
  return screen.getByText(titleRe).closest("dialog") as HTMLElement;
}

beforeEach(() => {
  fetchMock = vi.fn();
  // `Members` now also calls `useAdminLocale()` (real `fetch`, not this screen's own concern), which
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

async function openMenu(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.click(screen.getByRole("button", { name: `Actions for member "${email}"` }));
  return screen.getByRole("menu");
}

describe("an active member's menu", () => {
  it("offers both Resend sign-in link and Disable", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ members: [ACTIVE_MEMBER] }));
    render(<Members />);

    await screen.findByText("alice@example.com");
    const menu = await openMenu(user, "alice@example.com");
    expect(within(menu).getByRole("menuitem", { name: "Resend sign-in link" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Disable" })).toBeInTheDocument();
  });
});

describe("an already-disabled member's menu", () => {
  it("omits Disable entirely rather than showing it as a no-op", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ members: [DISABLED_MEMBER] }));
    render(<Members />);

    await screen.findByText("bob@example.com");
    const menu = await openMenu(user, "bob@example.com");
    expect(within(menu).getByRole("menuitem", { name: "Resend sign-in link" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Disable" })).not.toBeInTheDocument();
  });
});

describe("Disable — via RowMenu, confirm-gated", () => {
  it("opens a ConfirmDialog instead of acting immediately, and only disables on confirm", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ members: [ACTIVE_MEMBER] }))
      .mockResolvedValueOnce(jsonResponse({ member: { ...ACTIVE_MEMBER, status: "disabled" } }));
    render(<Members />);

    await screen.findByText("alice@example.com");
    const menu = await openMenu(user, "alice@example.com");
    await user.click(within(menu).getByRole("menuitem", { name: "Disable" }));

    const dialog = dialogFor(/disable this member\?/i);
    expect(dialog).toHaveAttribute("open");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/disable"))).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: /^disable$/i }));

    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/disable"))).toBe(true);
    await screen.findByText("disabled");
    expect(dialog).not.toHaveAttribute("open");
  });

  it("cancelling leaves the member untouched", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ members: [ACTIVE_MEMBER] }));
    render(<Members />);

    await screen.findByText("alice@example.com");
    const menu = await openMenu(user, "alice@example.com");
    await user.click(within(menu).getByRole("menuitem", { name: "Disable" }));

    const dialog = dialogFor(/disable this member\?/i);
    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    expect(dialog).not.toHaveAttribute("open");
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/disable"))).toBe(false);
  });
});

describe("Resend sign-in link — via RowMenu, immediate", () => {
  it("fires immediately with no dialog and shows a per-row notice", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ members: [ACTIVE_MEMBER] }))
      .mockResolvedValueOnce(jsonResponse({ delivered: true }));
    render(<Members />);

    await screen.findByText("alice@example.com");
    const menu = await openMenu(user, "alice@example.com");
    await user.click(within(menu).getByRole("menuitem", { name: "Resend sign-in link" }));

    expect(dialogFor(/disable this member\?/i)).not.toHaveAttribute("open");
    expect(await screen.findByText("Sign-in link sent.")).toBeInTheDocument();
  });
});
