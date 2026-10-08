import { afterEach, expect, test, vi } from "vitest";

import { api, ApiError, authenticatedAdminRequest, onUnauthenticated, requestOnce, requestRidingOutRestart } from "../api";

/**
 * @file Characterization tests for `request()`'s two branches that no existing suite exercised
 * through a real, `fetch`-stubbed `Response` before the 2026-09-04 complexity-reduction refactor
 * (`apps/admin/src/lib/api.ts:1759`):
 *
 * 1. The `onOk` hook — called with the raw `Response` immediately before a 2xx resolves, and
 *    deliberately NOT called on the error path (`request`'s own doc comment). `getDockerfileSource`/
 *    `setDockerfileSource` are the only callers that pass it, to merge the `ETag` response header
 *    into their result; `use-dockerfile-source.unit.test.tsx` only exercises this through a fake
 *    port, never through a real stubbed `fetch`, so the header-read path itself was unpinned.
 * 2. A response body that legitimately, parseably parses to the JSON literal `null` — distinct from
 *    an unparseable body (`UNPARSEABLE_BODY` sentinel) and from an empty `{}` object, per
 *    `UNPARSEABLE_BODY`'s own doc comment. `body?.error`/`body?.code` must short-circuit on `null`
 *    the same way they do on `undefined`.
 *
 * Pinned before refactoring so the extraction cannot silently change either branch.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

test("onOk merges the ETag response header into a successful getDockerfileSource result", async () => {
  stubFetch(
    async () =>
      new Response(JSON.stringify({ exists: true, contents: "FROM node:22\n" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ETag: '"abc123"' },
      })
  );

  await expect(api.getDockerfileSource()).resolves.toEqual({
    exists: true,
    contents: "FROM node:22\n",
    etag: '"abc123"',
  });
});

test("onOk falls back to an empty-string etag when the response has no ETag header", async () => {
  stubFetch(
    async () =>
      new Response(JSON.stringify({ exists: false, contents: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
  );

  await expect(api.getDockerfileSource()).resolves.toEqual({ exists: false, contents: null, etag: "" });
});

test("onOk is not invoked on a non-2xx response", async () => {
  const headersGet = vi.fn(() => null);
  stubFetch(async () => {
    const res = new Response(JSON.stringify({ error: "not found", code: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
    vi.spyOn(res.headers, "get").mockImplementation(headersGet);
    return res;
  });

  await expect(api.getDockerfileSource()).rejects.toThrow("not found");
  expect(headersGet.mock.calls).toEqual([["x-tovu-upstream-status"]]);
});

test("a literal JSON null error body is treated as a body with no code/error field, not as UNPARSEABLE", async () => {
  stubFetch(async () => new Response("null", { status: 500, headers: { "Content-Type": "application/json" } }));

  const error = await api.login({ username: "a", password: "b" }).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(Error);
  const apiError = error as import("../api").ApiError;
  // Parseable JSON (even `null`) proves an application answered, so this keeps the status-only
  // fallback rather than the "cannot reach the API" message an unparseable 5xx gets.
  expect(apiError.message).toBe("request failed (500)");
  expect(apiError.code).toBeUndefined();
  expect(apiError.body).toBeNull();
});

test("a literal JSON null 401 body does not notify unauthenticated listeners — no code to match", async () => {
  stubFetch(async () => new Response("null", { status: 401, headers: { "Content-Type": "application/json" } }));

  const listener = vi.fn();
  const unsubscribe = onUnauthenticated(listener);
  try {
    const error = await api.login({ username: "a", password: "b" }).catch((e: unknown) => e);
    expect((error as Error).message).toBe("request failed (401)");
    expect(listener).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
  }
});

test("authenticated transport preserves explicit base, signal, headers, keepalive, onOk and a null JSON body", async () => {
  const signal = new AbortController().signal;
  const response = new Response("null", { status: 200 });
  const onOk = vi.fn();
  const fetchFake = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchFake);
  await expect(authenticatedAdminRequest({ method: "PUT", path: "/rescan", body: null }, {
    basePath: "/api/agents", signal, headers: { "If-Match": '"version-1"' }, keepalive: true, onOk,
  })).resolves.toBeNull();
  expect(fetchFake).toHaveBeenCalledExactlyOnceWith("/api/agents/rescan", {
    method: "PUT", credentials: "same-origin", body: "null", signal, keepalive: true,
    headers: { "Content-Type": "application/json", "If-Match": '"version-1"' },
  });
  expect(onOk).toHaveBeenCalledExactlyOnceWith(response);
});

test("authenticated transport preserves binary adapter bodies and their content type", async () => {
  const body = new Blob(["binary payload"], { type: "application/zip" });
  const fetchFake = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchFake);
  await authenticatedAdminRequest({ method: "POST", path: "/upload", body }, { headers: { "If-Match": '"version-1"' } });
  expect(fetchFake).toHaveBeenCalledExactlyOnceWith("/api/admin/v1/upload", expect.objectContaining({
    body, headers: { "Content-Type": "application/zip", "If-Match": '"version-1"' },
  }));
});

test("custom error contracts retain the upstream-refused proof needed to safely retry an undelivered write", async () => {
  const fetchFake = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
    .mockImplementationOnce(async () => new Response(null, { status: 503, headers: { "x-tovu-upstream-status": "upstream-refused" } }))
    .mockImplementationOnce(async () => new Response('{"ok":true}', { status: 200 }));
  vi.stubGlobal("fetch", fetchFake);
  const waitUntilReachable = vi.fn(async () => true);
  const reconnect = { waitUntilReachable, getStatus: () => "online" as const, subscribe: () => () => {} };
  await expect(requestRidingOutRestart({
    method: "POST",
    send: () => requestOnce({ path: "/rescan", init: { method: "POST" } }, {
      basePath: "/api/agents",
      errorFactory: ({ error }) => new ApiError("POST /api/agents/rescan answered 503", error.status, error.code, error.body),
    }),
  }, { reconnect })).resolves.toEqual({ ok: true });
  expect(waitUntilReachable).toHaveBeenCalledTimes(1);
  expect(fetchFake).toHaveBeenCalledTimes(2);
  expect(fetchFake.mock.calls.map(([url]) => url)).toEqual(["/api/agents/rescan", "/api/agents/rescan"]);
});

test("custom error contracts do not replay a write that may already have reached the server", async () => {
  const fetchFake = vi.fn(async () => new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetchFake);
  const waitUntilReachable = vi.fn(async () => true);
  const reconnect = { waitUntilReachable, getStatus: () => "online" as const, subscribe: () => () => {} };
  await expect(requestRidingOutRestart({
    method: "POST",
    send: () => requestOnce({ path: "/rescan", init: { method: "POST" } }, {
      basePath: "/api/agents",
      errorFactory: ({ error }) => new ApiError("POST /api/agents/rescan answered 503", error.status, error.code, error.body),
    }),
  }, { reconnect })).rejects.toThrow("POST /api/agents/rescan answered 503");
  expect(waitUntilReachable).not.toHaveBeenCalled();
  expect(fetchFake).toHaveBeenCalledTimes(1);
});
