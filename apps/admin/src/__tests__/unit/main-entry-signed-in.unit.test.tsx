// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { appShellApiBody } from "../app-shell-api.fixture";

/**
 * @file The entry module's signed-in path: once `/auth/me` answers a user, `SessionApp` wraps the
 * app in the comment-queue scope for that principal and the shell (not the login screen) mounts.
 * `main-entry.unit.test.tsx` covers the signed-out path; the entry module renders on import, so
 * each path needs its own file (one import per module registry).
 *
 * `fetch`, `EventSource` and `ResizeObserver` are stubbed before the (dynamic) import for the same reasons
 * `app-logout-confirm.unit.test.tsx`'s header gives; every other read answers an empty payload.
 */

beforeAll(() => {
  document.body.innerHTML = '<div id="root"></div>';
  window.history.replaceState(null, "", "/admin/");
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (url: string) => {
    if (new URL(String(url), "http://localhost").pathname.endsWith("/auth/me")) {
      return json({ user: { id: "owner-1", username: "admin" }, effectivePermissions: [] });
    }
    return json(appShellApiBody({ url: String(url) }));
  });
  vi.stubGlobal("EventSource", class { close() {} addEventListener() {} removeEventListener() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

afterAll(() => { vi.unstubAllGlobals(); });

it("mounts the signed-in shell, not the login screen, once the session has a user", async () => {
  // Imported here, after the stubs: the entry module renders into #root on import.
  await import("../../main");
  expect(await screen.findByRole("button", { name: "Log out" }, { timeout: 10000 })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
}, 30000);
