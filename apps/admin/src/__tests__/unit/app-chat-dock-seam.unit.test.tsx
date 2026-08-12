// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App } from "../../App";
import type { UseAdminSession, UseChatDockLayout } from "../../App.hooks";

/**
 * @file Proves `App`'s `useChatDock` seam (added 2026-08-12 alongside the rest of `App.hooks.tsx`'s
 * seams — see that file's own header) buys something none of the other App tests can reach today:
 * asserting the assistant dock's OPEN state.
 *
 * jsdom implements no `ResizeObserver`, and `useChatDockLayout`'s real `sheetHeightPx`/`dockWidthPx`
 * measurement effects construct one the moment `chatOpen` is true in sheet mode —
 * `__tests__/setup.ts`'s own comment on that gap says explicitly not to stub it with a no-op, since
 * that would let a test assert clearance behavior that never actually measured anything. That has
 * left "does the dock actually open" untested by every App test in this directory: none of them
 * ever sets `chatOpen`, because doing so through the real hook risks exactly the uncaught-throw
 * tear-down the sibling tests' own `EventSource` comments describe for a different missing global.
 * A fake `useChatDockLayout` sidesteps the problem outright — the real hook, and its real
 * `ResizeObserver` call, never runs at all.
 */

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  // See the sibling App tests in this directory: jsdom has no `EventSource`, and `App`'s
  // page-control bridge (`useAgentPageBridge`, not faked here) constructs one once `<main>`
  // mounts.
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

it("renders the assistant dock's open state through a fake useChatDock, with no real ResizeObserver involved", () => {
  const fakeSession: UseAdminSession = {
    user: { id: "u1", username: "admin" },
    checking: false,
    handleLogin: vi.fn(),
    logout: vi.fn(),
  };
  const fakeChatDock: UseChatDockLayout = {
    chatOpen: true,
    setChatOpen: vi.fn(),
    sheetExpanded: false,
    setSheetExpanded: vi.fn(),
    isSheetMode: true,
    // A value the real hook could never produce on the very first render — it starts at 0 and
    // only becomes nonzero after a ResizeObserver entry arrives, which never happens here (per
    // INFO.md's Components rule 3: "make the fake return something the real hook cannot
    // produce"). If `App` were ever wired back to call the real hook directly, this combination
    // (`chatOpen && isSheetMode` with a nonzero `sheetHeightPx` already present) could not appear
    // synchronously, and this test's `sheetHeightPx` assertion below would catch the regression.
    sheetHeightPx: 424,
    dockWidthPx: 0,
    chatDockRef: { current: null },
    chatFabRef: { current: null },
  };

  const { container } = render(<App useSession={() => fakeSession} useChatDock={() => fakeChatDock} />);

  const aside = container.querySelector("aside.admin-chat-dock");
  expect(aside).not.toBeNull();
  expect(aside).not.toHaveAttribute("hidden");
  expect(aside).toHaveClass("is-open");

  // `avoidBottomPx` threads the fake's `sheetHeightPx` straight through to `ChatFab` — real UI
  // wiring this test can now see end to end, not just the dock's own open/closed class.
  const fab = container.querySelector(".chat-fab");
  expect(fab).toHaveStyle({ bottom: "444px" }); // sheetHeightPx (424) + FAB_EDGE_MARGIN (20)
});
