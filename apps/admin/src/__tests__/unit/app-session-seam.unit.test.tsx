// @vitest-environment jsdom
import { render as renderWithoutProvider } from "@testing-library/react";
import type { ReactElement } from "react";
import { FetchQueryProvider } from "../../lib/fetch-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App } from "../../App";
import type { UseAdminSession } from "../../App.hooks";

/**
 * @file Proves `App`'s `useSession` seam (added alongside the `App.hooks.tsx` extraction,
 * 2026-08-12 — see that file's own header for why this is the one of the four extracted hooks
 * worth injecting) actually buys what it is for.
 *
 * Every OTHER test in this directory (`app-plugins-route`, `app-sidebar-rail-storage-key`,
 * `app-agent-page-identity`, `app-route-prototype-keys`) renders against the REAL
 * `useAdminSession`, so each one has to shape a `fetch` mock around `/auth/me` and `waitFor` the
 * `.boot-screen` to clear before it can assert anything about routing or the shell — the auth
 * round trip is incidental to what those tests actually care about, but unavoidable without this
 * seam. This test renders already authenticated via a fake `useSession` and skips both: the boot
 * screen must never appear at all, and the assertion needs no `waitFor`.
 */

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  // Still stubbed — `useAdminLocale`'s `loadLanguage()` and other mounted screens still read
  // through `fetch` regardless of the session seam, and `useAdminLocale` swallows a failed fetch
  // to the English default by design (see that hook's own doc), so a generic empty success is
  // enough; this test's point is skipping the AUTH round trip specifically, not every network call
  // `App`'s tree might make.
  fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  // See the sibling App tests in this directory: jsdom has no `EventSource`, and `App`'s
  // page-control bridge (`useAgentPageBridge`) constructs one in an effect once `<main>` mounts —
  // which happens on the FIRST render here, since the fake session never shows the boot screen.
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

it("renders the authenticated shell immediately through a fake useSession, with no boot screen and no session-boot round trip", () => {
  const fakeSession: UseAdminSession = {
    user: { id: "u1", username: "admin" },
    checking: false,
    handleLogin: vi.fn(),
    logout: vi.fn(),
  };

  // No `waitFor` anywhere in this test — that absence IS the assertion the seam exists to make
  // possible. If `checking` still needed an async round trip to resolve, reading `container`
  // synchronously right after `render()` would be racing a state update instead of reading a
  // settled tree.
  const { container } = render(<App useSession={() => fakeSession} />);

  // The seam is proven structurally by these two: `useSession` is a full replacement for
  // `useAdminSession` (`App.hooks.tsx`), so ITS internal effect — the one that chains into
  // `api.me()` on `checking` — never runs at all; `.boot-screen` staying absent and `main` being
  // present on the very first synchronous read is what "never runs" looks like from outside.
  //
  // This used to also assert no `fetch` call's URL contained `/auth/me`, as a second, indirect
  // proxy for the same thing. That stopped being a valid signal once the dashboard's own
  // independent password-banner nag (`dashboard-dependencies.hooks.ts`'s `getPasswordStatus`,
  // commit 4cc0fe890) started pairing its per-browser Dismiss with the caller's id from a genuine,
  // unrelated `GET /auth/me` call of its own — legitimate, and outside what this `useSession` prop
  // can or should suppress. An exact-URL check does not rescue the assertion either: that call's
  // URL IS the literal session-check path, not merely a similarly-named sibling like
  // `/auth/me/password-status`. There is no fetch-shaped signal left that distinguishes "the boot
  // effect ran" from "an unrelated feature made its own call to the same endpoint," so the network
  // assertion is dropped in favor of the two structural ones above.
  expect(container.querySelector(".boot-screen")).toBeNull();
  expect(container.querySelector("main")).not.toBeNull();
});

/** `App` mounts the assistant dock, whose agents list reads through the app's query cache — render
 *  under the same provider `main.tsx` wraps `App` in. */
function render(ui: ReactElement) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
}
