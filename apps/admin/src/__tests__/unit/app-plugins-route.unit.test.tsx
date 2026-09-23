// @vitest-environment jsdom
import { render as renderWithoutProvider, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { FetchQueryProvider } from "../../lib/fetch-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App } from "../../App";

/**
 * @file REQ-17/AC-25 — `App.tsx`'s `case "section":` dispatch must render `Plugins`, not
 * `<Placeholder sectionId="plugins">`, once wired (tasks.md T026).
 *
 * TDD-certified against the CURRENT `App.tsx` (an existing, already-shipped file this dispatch
 * does not modify) — currently RED: today's dispatch has no `"plugins"` branch, so the route
 * falls through to `<Placeholder>`, which renders successfully (a real, working component) and
 * shows its own placeholder copy. This test asserts that copy is ABSENT once this amendment
 * ships — a assertion that is genuinely, meaningfully red today without depending on
 * `Plugins.tsx`'s own stub-throws state at all (this test never needs `Plugins` to render
 * successfully to prove today's gap).
 */

const PLACEHOLDER_COPY = /Placeholder for future plugin and module administration/i;

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ user: { id: "u1", username: "admin" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Any other call (e.g. this screen's own listPlugins()) — a benign empty list, so a
    // successfully-implemented Plugins component has something deterministic to render.
    return new Response(JSON.stringify({ plugins: [] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no `EventSource`, and `App`'s page-control bridge constructs one in an effect. That
  // throw used to surface as tolerated unhandled noise, but it tears the tree down — so `<main>` is
  // gone by the time the `data-agent-page` assertion runs. An inert stub is enough; nothing here
  // exercises page control.
  vi.stubGlobal(
    "EventSource",
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
    },
  );
  // `replaceState`, not `location.pathname = …`: assigning a path is a real navigation, which jsdom
  // does not implement (it warns and leaves the URL alone, so the app would render the dashboard
  // and this test would pass vacuously — the dashboard has no Placeholder copy either).
  window.history.replaceState(null, "", "/admin/plugins");
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

it("AC-25: navigating to /admin/plugins does NOT fall through to <Placeholder>'s copy", async () => {
  const { container } = render(<App />);

  // Wait for the boot screen to clear, rather than for text: `findByText(/plugins/i)` rejects
  // immediately when several nodes match (the sidebar item *and* the screen), and the `.catch` that
  // used to swallow that let the assertions run before the tree had settled.
  await waitFor(() => expect(container.querySelector(".boot-screen")).toBeNull(), { timeout: 3000 });

  /*
   * Assert the route actually resolved, not merely that the Placeholder copy is absent.
   *
   * Raised in an external audit of the hash→path routing change: on its own, the assertion below
   * passes for the wrong reason if `/admin/plugins` regresses to the dashboard — `findByText(/plugins/i)`
   * happily matches the *sidebar* nav item, and the dashboard has no Placeholder copy either. So the
   * test would go green while proving nothing. `data-agent-page` is set from `activeSectionId(route)`,
   * making it the one assertion that pins which route the app believes it is on.
   */
  expect(container.querySelector("main")).toHaveAttribute("data-agent-page", "plugins");
  expect(screen.queryByText(PLACEHOLDER_COPY)).not.toBeInTheDocument();
});

/** `App` mounts the assistant dock, whose agents list reads through the app's query cache — render
 *  under the same provider `main.tsx` wraps `App` in. */
function render(ui: ReactElement) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
}
