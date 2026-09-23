// @vitest-environment jsdom
import { render as renderWithoutProvider, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { FetchQueryProvider } from "../../lib/fetch-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App } from "../../App";

/**
 * @file Pins the desktop sidebar rail's `localStorage` key as wired by `App.tsx`, not the
 * `Sidebar`/`useSidebarRail` behavior itself — that behavior (persistence, cross-tab sync, a
 * host-supplied key overriding the package default) now belongs to `@jini-ai/admin/react` and is
 * covered by that package's own `use-sidebar-rail.test.tsx`.
 *
 * What is still genuinely Tovu's to test: `App.tsx` passes `SIDEBAR_RAIL_STORAGE_KEY =
 * "tovu-admin-sidebar-rail-collapsed"` through `Sidebar`'s `railStorageKey` prop rather than
 * leaving it unset. Tovu persisted the rail collapse under that literal key before this package
 * existed; the package's own default is a different string
 * (`jini-admin-sidebar-rail-collapsed`). Regressing the prop wiring — dropping it, or passing the
 * wrong literal — would silently strand every operator's saved preference: their rail springs back
 * open on the next deploy, indistinguishable from a UI bug. No package-level test can catch that,
 * because the literal key is a Tovu fact, not a package one.
 */

const LEGACY_KEY = "tovu-admin-sidebar-rail-collapsed";

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ user: { id: "u1", username: "admin" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  // See app-plugins-route.unit.test.tsx: jsdom has no EventSource, and App's page-control bridge
  // constructs one in an effect. An inert stub is enough; nothing here exercises page control.
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
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

it(
  "persists the desktop rail collapse under Tovu's pre-existing localStorage key",
  async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await waitFor(() => expect(container.querySelector(".boot-screen")).toBeNull(), { timeout: 3000 });

    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    // `App.tsx` passes `railDefaultCollapsed`, so a first-time operator starts on the rail and the
    // control offers to EXPAND. Asserting the starting label explicitly means a future change to that
    // default fails here with a readable message rather than as a confusing "button not found".
    expect(container.querySelector(".cms-nav")).toHaveClass("is-rail");

    // Both directions are exercised, because the key wiring is what this file exists to pin and a
    // write in only one direction would leave half of it unproven.
    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(localStorage.getItem(LEGACY_KEY)).toBe("0");

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(localStorage.getItem(LEGACY_KEY)).toBe("1");

    // Never written under the package's own default key.
    expect(localStorage.getItem("jini-admin-sidebar-rail-collapsed")).toBeNull();
  },
  // Mounts the full `<App />` and drives two click cycles; under `--coverage` instrumentation
  // overhead this reliably exceeds vitest's 5000ms default (measured 5259ms in a full-suite
  // coverage run) even though it passes in well under a second standalone. Verified 3/3 passes
  // without --coverage before this bump — the test itself was not hanging.
  15000,
);

it("lets an operator's saved EXPANDED choice beat the collapsed-by-default wiring", async () => {
  // The regression `railDefaultCollapsed` could easily have introduced. `useSidebarRail` used to
  // read `getItem(key) === '1'`, which makes an absent key and a stored "0" indistinguishable —
  // harmless under an expanded default, but under a collapsed one it would re-collapse the rail on
  // every load for the one operator who deliberately opened it, with no way to make it stick.
  localStorage.setItem(LEGACY_KEY, "0");
  const { container } = render(<App />);

  await waitFor(() => expect(container.querySelector(".boot-screen")).toBeNull(), { timeout: 3000 });

  expect(container.querySelector(".cms-nav")).not.toHaveClass("is-rail");
});

it("reads a rail preference an operator already saved before this migration", async () => {
  localStorage.setItem(LEGACY_KEY, "1");
  const { container } = render(<App />);

  await waitFor(() => expect(container.querySelector(".boot-screen")).toBeNull(), { timeout: 3000 });

  expect(container.querySelector(".cms-nav")).toHaveClass("is-rail");
});

/** `App` mounts the assistant dock, whose agents list reads through the app's query cache — render
 *  under the same provider `main.tsx` wraps `App` in. */
function render(ui: ReactElement) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
}
