// @vitest-environment jsdom
import { fireEvent, render as renderWithoutProvider, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { FetchQueryProvider } from "../../lib/fetch-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App } from "../../App";
import type { UseAdminSession } from "../../App.hooks";

/**
 * @file Owner-requested (2026-08-31): "people may click [Log out] by accident, so it should ask
 * 'are you sure you want to log out?'". Proves the sidebar's logout button now opens a confirmation
 * dialog instead of calling the real `logout()` immediately, and — the whole point of the change —
 * that Cancel (and Escape) leave a session intact while Confirm actually logs out.
 *
 * Same fake-`useSession` harness as `app-session-seam.unit.test.tsx`: renders already-authenticated
 * with no `waitFor` on the boot screen, and stubs `fetch`/`EventSource` for the same reasons that
 * file's own header documents (other mounted screens still read through `fetch` regardless of the
 * session seam; `useAgentPageBridge` constructs an `EventSource` once `<main>` mounts).
 *
 * `ConfirmDialog` itself (Escape/backdrop/focus-trap/focus-return mechanics) is Jini's own
 * component, covered by its own package tests — see `PostTemplateModal.unit.test.tsx`'s identical
 * scoping note. This file tests the INTEGRATION: that a real click reaches this dialog, and that
 * only Confirm — never Cancel, never Escape — reaches the real `logout`.
 */

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn(
    async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "EventSource",
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function fakeSession(logout: () => Promise<void>): UseAdminSession {
  return {
    user: { id: "u1", username: "admin" },
    checking: false,
    handleLogin: vi.fn(),
    logout,
  };
}

function getLogoutDialog(): HTMLElement {
  return screen.getByText("Are you sure you want to log out?").closest("dialog") as HTMLElement;
}

it("clicking the sidebar's Log out opens the confirmation dialog without logging out", async () => {
  const logout = vi.fn(async () => {});
  const user = userEvent.setup();
  render(<App useSession={() => fakeSession(logout)} />);

  await user.click(screen.getByRole("button", { name: "Log out" }));

  expect(screen.getByText("Are you sure you want to log out?")).toBeInTheDocument();
  expect(logout).not.toHaveBeenCalled();
});

it("Cancel closes the dialog and never calls the real logout", async () => {
  const logout = vi.fn(async () => {});
  const user = userEvent.setup();
  render(<App useSession={() => fakeSession(logout)} />);

  await user.click(screen.getByRole("button", { name: "Log out" }));
  const dialog = getLogoutDialog();
  await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

  expect(logout).not.toHaveBeenCalled();
  // `ConfirmDialog` stays mounted and toggles the native `<dialog>`'s own `open` attribute rather
  // than being conditionally rendered by its caller (see that component's own file header) — so the
  // real signal that it closed is this attribute, not the body text leaving the DOM.
  expect(dialog.hasAttribute("open")).toBe(false);
});

it("the native cancel event (what a real browser fires on Escape) closes the dialog without logging out", async () => {
  const logout = vi.fn(async () => {});
  const user = userEvent.setup();
  render(<App useSession={() => fakeSession(logout)} />);

  await user.click(screen.getByRole("button", { name: "Log out" }));
  const dialog = getLogoutDialog();
  await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));
  fireEvent(dialog, new Event("cancel", { cancelable: true }));

  expect(logout).not.toHaveBeenCalled();
  expect(dialog.hasAttribute("open")).toBe(false);
});

it("Confirm — the only path that logs out — calls the real logout", async () => {
  const logout = vi.fn(async () => {});
  const user = userEvent.setup();
  render(<App useSession={() => fakeSession(logout)} />);

  await user.click(screen.getByRole("button", { name: "Log out" }));
  const dialog = getLogoutDialog();
  // The confirm button's own accessible name is the same "Log out" as the sidebar trigger — scoped
  // to the dialog (`within`) rather than `screen`, which would otherwise match both.
  await user.click(within(dialog).getByRole("button", { name: "Log out" }));

  expect(logout).toHaveBeenCalledTimes(1);
});

it("the confirm action is not the default-focused element — focus opens on Cancel", async () => {
  const logout = vi.fn(async () => {});
  const user = userEvent.setup();
  render(<App useSession={() => fakeSession(logout)} />);

  await user.click(screen.getByRole("button", { name: "Log out" }));
  const dialog = getLogoutDialog();

  expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
});

/** `App` mounts the assistant dock, whose agents list reads through the app's query cache — render
 *  under the same provider `main.tsx` wraps `App` in. */
function render(ui: ReactElement) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
}
