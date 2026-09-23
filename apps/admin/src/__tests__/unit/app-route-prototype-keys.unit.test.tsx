// @vitest-environment jsdom
import { render as renderWithoutProvider, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { FetchQueryProvider } from "../../lib/fetch-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../App";

/**
 * @file A URL naming an `Object.prototype` member must not be treated as a section.
 *
 * `App.tsx`'s `SECTIONS` map is deliberately both the router's allowlist and the render dispatch.
 * The obvious membership test for that — `segment in SECTIONS` — is wrong, because `in` walks the
 * prototype chain: every `Object.prototype` member passed the allowlist and was then *called as a
 * section renderer*. Caught in review of the hash→path routing change, and regressed live before
 * this test existed:
 *
 *   /admin/constructor     `Object()` → `{}`      → render threw "Objects are not valid as a React child"
 *   /admin/valueOf         same
 *   /admin/__proto__       `Object.prototype`     → not callable → TypeError
 *   /admin/toString        `Object.prototype.toString` → rendered the string "[object Object]"
 *   /admin/hasOwnProperty  → rendered "false"
 *
 * All five previously resolved to the dashboard, so each was a real regression reachable by typing a
 * URL. The fix is `Object.hasOwn` in `sectionRenderer`, applied at BOTH call sites — the render path
 * needs it independently, because the legacy `/section/:id` branch accepts an arbitrary id that
 * never passes the parser's check.
 *
 * Asserted through `App` rather than by exporting `parseRoute`: what matters is that the app renders
 * the dashboard and does not crash, which is only observable from out here.
 */

const PROTOTYPE_KEYS = ["constructor", "valueOf", "__proto__", "toString", "hasOwnProperty"];

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ user: { id: "u1", username: "admin" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Every case here lands on the Dashboard, whose effects read `r.posts` and
    // `r.settings.activeThemeId`. Returning a bare `{}` makes those throw — harmless to the
    // assertions, but it fills the run with unhandled-error noise that obscures real failures.
    return new Response(JSON.stringify({ posts: [], settings: { activeThemeId: "t1" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no `EventSource`, and `App`'s page-control bridge constructs one in an effect. In the
  // older route test that surfaces as tolerated unhandled noise; this file renders `App` once per
  // case, so it has to be stubbed or the throw fails every assertion. An inert stub is enough —
  // nothing here exercises page control.
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

describe("a prototype-chain key in the URL is not a section", () => {
  for (const key of PROTOTYPE_KEYS) {
    it(`/admin/${key} renders the dashboard instead of crashing`, async () => {
      window.history.replaceState(null, "", `/admin/${key}`);

      // Would throw during render before the fix, so the render call itself is the assertion for
      // the `constructor`/`valueOf`/`__proto__` cases.
      render(<App />);
      await screen.findByText(/dashboard/i, {}, { timeout: 3000 });

      // And these catch the two that rendered garbage rather than throwing.
      expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
      expect(screen.queryByText(/^false$/)).not.toBeInTheDocument();
    });
  }

  it("the same key behind the legacy /section/:id route also falls back to Placeholder", async () => {
    // This path bypasses the parser's allowlist entirely, which is why `sectionRenderer` — not just
    // the parser — has to be the thing doing the own-property check.
    window.history.replaceState(null, "", "/admin/section/constructor");

    render(<App />);
    await screen.findByText(/unknown section/i, {}, { timeout: 3000 });
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
  });
});

/** `App` mounts the assistant dock, whose agents list reads through the app's query cache — render
 *  under the same provider `main.tsx` wraps `App` in. */
function render(ui: ReactElement) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
}
