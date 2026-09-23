// @vitest-environment jsdom
import { fireEvent, render as renderWithoutProvider, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { FetchQueryProvider } from "../../lib/fetch-query";
import type { DragEvent } from "react";
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

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

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

function fakeSession(): UseAdminSession {
  return {
    user: { id: "u1", username: "admin" },
    checking: false,
    handleLogin: vi.fn(),
    logout: vi.fn(),
  };
}

function fakeChatDock(overrides: Partial<UseChatDockLayout> = {}): UseChatDockLayout {
  return {
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
    handleDockDropCapture: vi.fn(),
    publishDropCapture: vi.fn(),
    ...overrides,
  };
}

it("renders the assistant dock's open state through a fake useChatDock, with no real ResizeObserver involved", () => {
  const chatDock = fakeChatDock();

  const { container } = render(<App useSession={fakeSession} useChatDock={() => chatDock} />);

  const aside = container.querySelector("aside.admin-chat-dock");
  expect(aside).not.toBeNull();
  expect(aside).not.toHaveAttribute("hidden");
  expect(aside).toHaveClass("is-open");

  // `avoidBottomPx` threads the fake's `sheetHeightPx` straight through to `ChatFab` — real UI
  // wiring this test can now see end to end, not just the dock's own open/closed class.
  const fab = container.querySelector(".chat-fab");
  expect(fab).toHaveStyle({ bottom: "444px" }); // sheetHeightPx (424) + FAB_EDGE_MARGIN (20)
});

// SPEC-053 AC-01 wiring gap (e6-o4, 2026-09-14): nothing proved that a drop on App's dock `<aside>`
// actually reaches the folder-drop handler. The chain is: `<aside onDropCapture>` ->
// `useChatDockLayout().handleDockDropCapture` -> whatever `AssistantDock` published through
// `publishDropCapture` (`useFolderDropBridge`). This test covers App's two hops; the hook's own
// forwarding is covered in `app-chat-dock-drop-capture.unit.test.tsx`.
it("a drop on the dock <aside> reaches useChatDock's handleDockDropCapture (capture phase), and AssistantDock publishes its folder-drop handler", async () => {
  const handleDockDropCapture = vi.fn((event: DragEvent<HTMLElement>) => event.preventDefault());
  const publishDropCapture = vi.fn();
  const chatDock = fakeChatDock({ handleDockDropCapture, publishDropCapture });

  const { container } = render(<App useSession={fakeSession} useChatDock={() => chatDock} />);
  const aside = container.querySelector("aside.admin-chat-dock");
  expect(aside).not.toBeNull();

  // `fireEvent` returns `dispatchEvent`'s result: `false` once any listener called `preventDefault`
  // — asserted on the native event rather than via `stopPropagation`, which React's root delegation
  // makes unobservable from a DOM listener.
  const notPrevented = fireEvent.drop(aside!);

  expect(handleDockDropCapture).toHaveBeenCalledTimes(1);
  expect(notPrevented).toBe(false);
  await waitFor(() => expect(publishDropCapture).toHaveBeenCalledWith(expect.any(Function)));
});

/** `App` mounts the assistant dock, whose agents list reads through the app's query cache — render
 *  under the same provider `main.tsx` wraps `App` in. */
function render(ui: ReactElement) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
}
