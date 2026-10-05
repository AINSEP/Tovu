/**
 * @file Coverage for `import-errors.ts`: each gateway/import error maps to its own HTTP status and
 * stable code with the error's own message; anything else is a 500 `INTERNAL_ERROR` with fixed text
 * (its message can carry a path, SQL or a credential) and the full error in the server log.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ForbiddenError, PlanStaleError } from "#src/contracts/core/gated-mutations/gateway";
import { PluginHookFailedError } from "#src/contracts/core/plugin-hook-failed-error";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "#src/contracts/core/gated-mutations/token";
import { RestorePointUnavailableError } from "#src/features/publish-content/execute-import";
import { PublishContentBundleNotFoundError } from "#src/features/publish-content/gated-hooks";
import { importErrorResponse } from "../import-errors.js";

test("each known import error maps to its status and code, keeping its message", () => {
  const cases: Array<[Error, number, string]> = [
    [new ForbiddenError({ message: "not allowed", reasonCode: "NOT_AUTHORIZED" }), 403, "NOT_AUTHORIZED"],
    [new PlanStaleError({ message: "plan changed" }), 409, "PLAN_STALE"],
    [new TokenExpiredError({ message: "token expired" }), 409, "TOKEN_EXPIRED"],
    [new TokenAlreadyRedeemedError({ message: "token used" }), 409, "TOKEN_ALREADY_REDEEMED"],
    [new RestorePointUnavailableError("no restore point"), 409, "RESTORE_POINT_UNAVAILABLE"],
    [new PublishContentBundleNotFoundError("bundle gone"), 404, "BUNDLE_NOT_FOUND"],
  ];
  for (const [err, status, code] of cases) {
    assert.deepEqual(importErrorResponse(err), { status, body: { error: err.message, code } }, code);
  }
});

test("a plugin save-hook refusal mid-import is a 500 PLUGIN_HOOK_FAILED naming the plugin, like the posts routes", () => {
  const err = new PluginHookFailedError("seo", "plugin 'seo' filter failed: password=hunter2", { refusedItemRef: "post:p-2" });
  assert.deepEqual(importErrorResponse(err), {
    status: 500,
    body: {
      error: "a site plugin (seo) refused item post:p-2; items applied before it stay saved, so check the import history before retrying",
      code: "PLUGIN_HOOK_FAILED",
      pluginId: "seo",
    },
  });
});

test("an unrecognised error is a 500 with fixed text; its own message goes only to the server log", (t) => {
  const logged = t.mock.method(console, "error", () => undefined);
  const err = new Error("SQLITE_CANTOPEN: unable to open /srv/tovu/site.db (password=hunter2)");
  assert.deepEqual(importErrorResponse(err), { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } });
  assert.deepEqual(logged.mock.calls.map((call) => call.arguments), [["[publish-content] import failed:", err]]);
});

test("a non-Error throw is a 500 with the generic message, logged the same way", (t) => {
  const logged = t.mock.method(console, "error", () => undefined);
  assert.deepEqual(importErrorResponse("secret detail"), { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } });
  assert.deepEqual(logged.mock.calls.map((call) => call.arguments), [["[publish-content] import failed:", "secret detail"]]);
});
