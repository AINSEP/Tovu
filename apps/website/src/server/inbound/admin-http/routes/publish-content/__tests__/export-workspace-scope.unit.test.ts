import assert from "node:assert/strict";
import test from "node:test";

import { registerPublishContentExportRoute } from "../export.js";
import type { PublishContentRouteDeps } from "../deps.js";

/**
 * @file Closes the mutation-sweep gap on `export.ts:51`'s
 * `if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {` —
 * `ADS-memory/reports/2026-09-20-mutation-sweep-changed-files.md` §6, "Load-bearing but untested".
 *
 * Two DIFFERENT mutants live on this one line, and only one of them was actually untested:
 *
 * - `guard-never-fires` (the `!==` comparison itself) IS already killed —
 *   `server/__tests__/routes/publish-content-export.test.ts`'s "404s when the URL workspace does
 *   not match this composition's own workspace" test proves a mismatched workspaceId is rejected.
 *   That test lives in a different directory tree than this route file
 *   (`server/__tests__/routes/` vs. this file's own `__tests__/`), which is exactly why the
 *   mutation-sweep tool's proximity-based auto-discovery never found it and misreported this
 *   mutant as untested — confirmed directly: `node development/scripts/mutation-sweep.mjs
 *   .../export.ts .../publish-content-export.test.ts` reports line 51's `guard-never-fires` mutant
 *   `killed`, not surviving.
 * - `drop-nullish-default` (the `?? ""` fallback) genuinely has no test, and this file supplies one.
 *
 * The `?? ""` fallback is provably a no-op for every REAL request: `:workspaceId` is a required
 * path segment on this route (`registerPublishContentExportRoute`'s own
 * `"/api/admin/v1/workspaces/:workspaceId/publish-content/export"`), so Express guarantees
 * `req.params.workspaceId` is always a defined, non-empty string before this handler ever runs —
 * `String(x ?? "")` and `String(x)` agree for every value that operator could ever see over HTTP.
 * Killing this mutant therefore requires calling the registered handler directly (bypassing
 * Express routing entirely, this repo's own `mock.module()`-adjacent technique for a
 * currently-unreachable-in-production defensive check — see `members/__tests__/disable.unit.test.ts`'s
 * file header for the same shape of problem) and a deliberately pathological `deps.workspaceId` —
 * literally the string `"undefined"` — chosen because it is the ONE value that makes
 * `String(req.params.workspaceId)` (no coalescing) collide with a real configured workspace id
 * while `String(req.params.workspaceId ?? "")` (with coalescing) still correctly does not. This is
 * a defense-in-depth proof, not a claim that today's HTTP surface can reach it.
 */

function buildHandler(deps: Partial<PublishContentRouteDeps>) {
  let handler: (req: { params: Record<string, unknown> }, res: unknown) => Promise<void>;
  const app = {
    get: (_path: string, h: typeof handler) => {
      handler = h;
    },
  };
  registerPublishContentExportRoute(app as never, deps as PublishContentRouteDeps);
  return (req: { params: Record<string, unknown> }, res: unknown) => handler(req, res);
}

function fakeRes() {
  const state = { status: 0, body: null as unknown };
  const res = {
    status(code: number) {
      state.status = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
  };
  return { res, state };
}

test("GET .../publish-content/export: an absent workspaceId param is normalized to empty string BEFORE comparison, not to the literal string \"undefined\"", async () => {
  // A pathological configured workspace id, chosen specifically so that `String(undefined)` (the
  // mutated, un-coalesced behavior) would accidentally satisfy the comparison while `String(undefined
  // ?? "")` (the real, coalesced behavior) still correctly does not.
  const handler = buildHandler({ workspaceId: "undefined" });
  const { res, state } = fakeRes();

  await handler({ params: {} }, res);

  assert.equal(state.status, 404, "an absent workspaceId param must never match a configured workspace id, however it is spelled");
  assert.deepEqual(state.body, { error: "workspace was not found" });
});

test("GET .../publish-content/export: a null workspaceId param is normalized to empty string BEFORE comparison, not to the literal string \"null\"", async () => {
  const handler = buildHandler({ workspaceId: "null" });
  const { res, state } = fakeRes();

  await handler({ params: { workspaceId: null } }, res);

  assert.equal(state.status, 404);
  assert.deepEqual(state.body, { error: "workspace was not found" });
});
