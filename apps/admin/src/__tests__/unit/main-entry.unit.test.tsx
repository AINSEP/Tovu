// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import { afterAll, expect, it, vi } from "vitest";

/**
 * @file Smoke test for the admin entry module (`src/main.tsx`). It runs the REAL module once:
 * the remixicon stylesheet override, the legacy-hash redirect and the React mount. No module is
 * mocked; the network is a fetch stub answering every call as signed out, so the mounted App
 * settles on its sign-in screen.
 *
 * The page state is prepared in `vi.hoisted` so the entry can be a static import: its module
 * graph (all of App) is then transformed at collection time, not inside the test's timeout
 * (a dynamic import inside the test timed out at 30s when run beside other suites).
 */

vi.hoisted(() => {
  document.body.innerHTML = '<div id="root"></div>';
  window.history.replaceState(null, "", "/admin/#/section/settings");
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "unauthenticated", code: "UNAUTHENTICATED" }), { status: 401, headers: { "content-type": "application/json" } }));
});

import "../../main";

afterAll(() => { vi.unstubAllGlobals(); });

it("installs the icon-font override, rewrites a legacy hash URL and mounts the app into #root", async () => {
  // The marker RemixIcon checks before injecting its own (bundler-broken) stylesheet.
  const styles = document.head.querySelectorAll("style[data-jini-remixicon]");
  expect(styles).toHaveLength(1);
  // Its CSS text is empty here: this config sets `css: false`, so the `?inline` import yields "".
  // What the marker carries in a build is a bundler concern; this pins that it is installed once.
  expect(styles[0]!.parentElement).toBe(document.head);

  // `/admin/#/section/settings` becomes `/admin/settings` in place.
  expect(window.location.pathname).toBe("/admin/settings");
  expect(window.location.hash).toBe("");

  const root = document.getElementById("root")!;
  await act(async () => {});
  expect(await screen.findByRole("button", { name: /sign in/i }, { timeout: 10000 })).toBeInTheDocument();
  expect(root.childElementCount).toBeGreaterThan(0);
}, 30000);
