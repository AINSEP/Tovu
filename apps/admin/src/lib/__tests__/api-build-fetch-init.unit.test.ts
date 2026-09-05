import { expect, test } from "vitest";

import { buildFetchInit } from "../api";

/**
 * @file Direct unit test for `api.ts`'s `buildFetchInit` — the private `fetch`-`init` merge helper
 * `request()` calls on every outgoing call. Exported solely for this test (see its own doc comment):
 * the merge-order bug this pins (`init.headers` silently replacing the whole merged `headers` object,
 * dropping the `Content-Type: application/json` default) has exactly one real-world caller today
 * (`api.setDockerfileSource`, regression-tested end-to-end in `api-endpoint-option-branches.unit.test.ts`),
 * but no in-repo caller currently overrides `Content-Type` itself — so the "explicit override wins"
 * branch is only reachable through this direct call, not through the public `api` surface.
 */

test("buildFetchInit keeps the Content-Type default when the caller passes an unrelated header", () => {
  const init = buildFetchInit({ headers: { "If-Match": '"abc123"' } });
  expect(init.headers).toEqual({
    "Content-Type": "application/json",
    "If-Match": '"abc123"',
  });
});

test("buildFetchInit lets a caller's explicit Content-Type override the default", () => {
  const init = buildFetchInit({ headers: { "Content-Type": "text/plain" } });
  expect(init.headers).toEqual({ "Content-Type": "text/plain" });
});

test("buildFetchInit still defaults credentials to same-origin and lets the caller override method/body", () => {
  const init = buildFetchInit({ method: "PUT", body: "x" });
  expect(init).toEqual({
    credentials: "same-origin",
    method: "PUT",
    body: "x",
    headers: { "Content-Type": "application/json" },
  });
});

test("buildFetchInit lets the caller override credentials itself", () => {
  const init = buildFetchInit({ credentials: "omit" });
  expect(init.credentials).toBe("omit");
});
