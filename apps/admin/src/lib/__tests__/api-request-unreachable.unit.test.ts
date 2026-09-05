import { afterEach, expect, test, vi } from "vitest";

import { API_UNREACHABLE_CODE, REQUEST_TIMEOUT_CODE, ApiError, api } from "../api";

/**
 * @file `request()`'s error translation, pinned at the two routes that produce "the operator cannot
 * tell that no server is running" — the failure reproduced end to end by
 * `development/e2e/login-api-down.spec.ts` (commit `fa822ca`).
 *
 * Driven through `api.login` rather than `request` itself, which is module-private on purpose;
 * `login` is the exact call the e2e reproduction makes, so the unit and browser evidence are about
 * the same code path rather than two similar ones.
 *
 * The unreachable-proxy fixture's shape is not invented: `Content-Type: text/plain` with a
 * zero-length body under a bare `500` is what this repo's own Vite `/api` proxy returns for an
 * unreachable target, verified live on 2026-08-06 against `apps/admin/vite.config.ts`'s proxy with
 * `TOVU_API_URL` pointed at a dead port.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A `Response` whose body cannot be parsed as JSON, exactly as a dev/reverse proxy answers when
 * nothing is listening upstream. `Response`'s own constructor produces the real `res.json()`
 * rejection, so nothing about the parse failure is faked. */
function proxyFailureResponse(status: number): Response {
  return new Response("", { status, headers: { "Content-Type": "text/plain" } });
}

function stubFetch(impl: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

test("an unparseable 5xx names the unreachable API instead of asserting a server error", async () => {
  stubFetch(async () => proxyFailureResponse(500));

  const error = await api.login({ username: "admin", password: "tovu-dev" }).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).message).toBe("cannot reach the Tovu API (HTTP 500) — is the server running?");
  expect((error as ApiError).status).toBe(500);
  expect((error as ApiError).code).toBe(API_UNREACHABLE_CODE);
});

test("a gateway status from a real reverse proxy is treated the same way", async () => {
  stubFetch(async () => proxyFailureResponse(502));

  const error = (await api.login({ username: "a", password: "b" }).catch((e: unknown) => e)) as ApiError;

  expect(error.message).toBe("cannot reach the Tovu API (HTTP 502) — is the server running?");
});

test("a rejected fetch — nothing listening at the origin — becomes the same actionable message", async () => {
  stubFetch(async () => {
    throw new TypeError("Failed to fetch");
  });

  const error = (await api.login({ username: "a", password: "b" }).catch((e: unknown) => e)) as ApiError;

  expect(error).toBeInstanceOf(ApiError);
  expect(error.message).toBe("cannot reach the Tovu API — is the server running?");
  expect(error.status).toBe(0);
  expect(error.code).toBe(API_UNREACHABLE_CODE);
  // The browser's own wording is preserved for devtools rather than swallowed by the translation.
  expect(error.body?.cause).toBe("Failed to fetch");
});

// Pinned ahead of the 2026-09-04 complexity-reduction pass extracting `fetchOrThrowUnreachable`'s
// catch-block classification into its own function: the "none of the above" fall-through was not
// exercised by any existing suite before this. `fetch`/`undici` themselves never reject with
// anything but `TypeError` for a reachability failure (see that function's own doc comment), but a
// caller can stub one (as here) — this pins that such a value is rethrown untouched, not folded
// into `ApiError` like the reachability cases above it.
test("a fetch rejection that is neither AbortError, TimeoutError, nor TypeError is rethrown untouched", async () => {
  const weird = new RangeError("something else entirely");
  stubFetch(async () => {
    throw weird;
  });

  const error = await api.login({ username: "a", password: "b" }).catch((e: unknown) => e);

  expect(error).toBe(weird);
  expect(error).not.toBeInstanceOf(ApiError);
});

// Pinned 2026-09-05 (`fix-apienc` dispatch, coverage-gap-fill TASK 2) — `errorName`'s own ternary
// has a false arm (returns `undefined`) for a rejection cause that is not an object with a string
// `.name` at all. The `RangeError` case above still has a string `.name` ("RangeError"), so it only
// exercises the ternary's TRUE arm with a non-matching value; a bare string cause has no `.name`
// property (`"name" in value` requires `value` to be an object — `typeof "boom" === "string"`, not
// `"object"`), so it is the one that reaches the false arm.
test("a fetch rejection with no .name at all (errorName's undefined-fallback arm) is rethrown untouched", async () => {
  stubFetch(async () => {
    throw "boom";
  });

  const error = await api.login({ username: "a", password: "b" }).catch((e: unknown) => e);

  expect(error).toBe("boom");
  expect(error).not.toBeInstanceOf(ApiError);
});

test("a caller-cancelled request is NOT reported as unreachable", async () => {
  const abort = new Error("The operation was aborted.");
  abort.name = "AbortError";
  stubFetch(async () => {
    throw abort;
  });

  const error = await api.login({ username: "a", password: "b" }).catch((e: unknown) => e);

  expect(error).toBe(abort);
  expect(error).not.toBeInstanceOf(ApiError);
});

test("a request that never gets a free connection times out as a readable ApiError, not a raw DOMException", async () => {
  // `AbortSignal.timeout()` firing rejects `fetch` with a `TimeoutError` DOMException — the exact
  // shape a real browser produces when a request queues forever with no free per-origin connection
  // (live-found 2026-08-17: the Themes screen's `getPresentation()` call, see
  // `development/e2e/themes-presentation-request-timeout.spec.ts` for the full-browser reproduction
  // this unit test's fetch layer alone cannot exercise).
  stubFetch(async () => {
    throw new DOMException("signal timed out", "TimeoutError");
  });

  const error = (await api.login({ username: "a", password: "b" }).catch((e: unknown) => e)) as ApiError;

  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(0);
  expect(error.code).toBe(REQUEST_TIMEOUT_CODE);
  expect(error.message).toMatch(/did not respond within/);
});

// Pinned alongside the DOMException case above: `throwTranslatedFetchFailure`'s TimeoutError branch
// reads `cause.message` when `cause instanceof Error` and falls back to `String(cause)` otherwise.
// The DOMException case above exercises the `String(cause)` side (jsdom's DOMException is not
// `instanceof Error`); this exercises the other side with a real `Error`-derived timeout cause.
test("a TimeoutError whose cause IS an Error uses its own .message, not String(cause)", async () => {
  const timeoutError = new Error("the operation timed out");
  timeoutError.name = "TimeoutError";
  stubFetch(async () => {
    throw timeoutError;
  });

  const error = (await api.login({ username: "a", password: "b" }).catch((e: unknown) => e)) as ApiError;

  expect(error).toBeInstanceOf(ApiError);
  expect(error.code).toBe(REQUEST_TIMEOUT_CODE);
  expect(error.body?.cause).toBe("the operation timed out");
});

test("a JSON error envelope still wins — the server answered, so its own message is used", async () => {
  stubFetch(
    async () =>
      new Response(JSON.stringify({ error: "invalid credentials", code: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
  );

  const error = (await api.login({ username: "a", password: "b" }).catch((e: unknown) => e)) as ApiError;

  expect(error.message).toBe("invalid credentials");
  expect(error.code).toBe("UNAUTHORIZED");
});

test("a JSON-bodied 500 keeps the status-only fallback — parseable JSON proves an app answered", async () => {
  stubFetch(
    async () =>
      new Response(JSON.stringify({}), { status: 500, headers: { "Content-Type": "application/json" } })
  );

  const error = (await api.login({ username: "a", password: "b" }).catch((e: unknown) => e)) as ApiError;

  expect(error.message).toBe("request failed (500)");
  expect(error.code).toBeUndefined();
});

test("an unparseable 4xx keeps the status-only fallback — a proxy that answered 404 is reachable", async () => {
  stubFetch(async () => proxyFailureResponse(404));

  const error = (await api.login({ username: "a", password: "b" }).catch((e: unknown) => e)) as ApiError;

  expect(error.message).toBe("request failed (404)");
});

test("a successful request with an empty body still resolves, unchanged", async () => {
  // `null`, not `""` — 204 is a null-body status and `Response`'s constructor rejects any body at
  // all for it, including an empty string.
  stubFetch(async () => new Response(null, { status: 204 }));

  await expect(api.logout()).resolves.toEqual({});
});
