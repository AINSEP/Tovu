import { afterEach, expect, test, vi } from "vitest";

import { api } from "../api";

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
  expect(headersGet).not.toHaveBeenCalled();
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

  const error = await api.login({ username: "a", password: "b" }).catch((e: unknown) => e);

  expect((error as Error).message).toBe("request failed (401)");
});
