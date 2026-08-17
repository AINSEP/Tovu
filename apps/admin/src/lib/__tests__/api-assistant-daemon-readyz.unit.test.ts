import { afterEach, expect, test, vi } from "vitest";

import { api } from "../api";

/**
 * @file `getAssistantDaemonReadyz()` — regression coverage for the 2026-08-17 source-control-ui
 * live-verified finding: under `npm run dev`, `apps/admin/vite.config.ts` did not proxy `/readyz`
 * (fixed alongside this test), so the plain-text 404 Vite's own dev server answers reached
 * `res.json()` unconditionally and threw a raw `Unexpected token 'T', "The server"... is not
 * valid JSON` straight into the "Restart assistant" UI. This file pins the fixture to the REAL
 * text Vite answers for that gap (reproduced live, not invented), same discipline
 * `api-request-unreachable.unit.test.ts` uses for its own proxy-failure fixture.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

test("a non-JSON response (the dev-proxy-gap fixture) rejects with a clean, operator-facing message — never a raw parse error", async () => {
  stubFetch(
    async () =>
      new Response(
        'The server is configured with a public base URL of /admin/ - did you mean to visit /admin/readyz instead?',
        { status: 404, headers: { "Content-Type": "text/plain" } }
      )
  );

  const error = await api.getAssistantDaemonReadyz().catch((e: unknown) => e);

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe("Could not check the assistant's status (unexpected response, HTTP 404).");
  expect((error as Error).message).not.toMatch(/Unexpected token|JSON/i);
});

test("a real 200 JSON response resolves with the parsed body", async () => {
  stubFetch(async () => new Response(JSON.stringify({ ready: true }), { status: 200, headers: { "Content-Type": "application/json" } }));

  await expect(api.getAssistantDaemonReadyz()).resolves.toEqual({ ready: true });
});

test("a real 503 JSON response (a latched failure) still resolves — 503 is an ordinary, meaningful body here, not an error to throw on", async () => {
  stubFetch(
    async () =>
      new Response(JSON.stringify({ ready: false, assistantDaemonKnownFailed: true }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
  );

  await expect(api.getAssistantDaemonReadyz()).resolves.toEqual({ ready: false, assistantDaemonKnownFailed: true });
});

test("a JSON content-type with an unparsable body also rejects cleanly, not with a raw parse error", async () => {
  stubFetch(async () => new Response("{not valid json", { status: 200, headers: { "Content-Type": "application/json" } }));

  const error = await api.getAssistantDaemonReadyz().catch((e: unknown) => e);

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe("Could not check the assistant's status (malformed response, HTTP 200).");
});
