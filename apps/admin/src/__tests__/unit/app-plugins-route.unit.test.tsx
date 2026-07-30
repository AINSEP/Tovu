// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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

let fetchMock: ReturnType<typeof vi.fn>;

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
  window.location.hash = "#/section/plugins";
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
});

it("AC-25: navigating to #/section/plugins does NOT fall through to <Placeholder>'s copy", async () => {
  render(<App />);

  // Wait past the initial "Loading Tovu…" / api.me() resolution.
  await screen.findByText(/plugins/i, {}, { timeout: 3000 }).catch(() => undefined);

  expect(screen.queryByText(PLACEHOLDER_COPY)).not.toBeInTheDocument();
});
