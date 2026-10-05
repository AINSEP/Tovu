/**
 * @file Coverage for `import-errors.ts`: each gateway/import error maps to its own HTTP status and
 * stable code with the error's own message; anything else is a 500 `INTERNAL_ERROR`, and a
 * non-`Error` throw carries the generic message rather than leaking a stringified value.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ForbiddenError, PlanStaleError } from "#src/contracts/core/gated-mutations/gateway";
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
    [new Error("disk full"), 500, "INTERNAL_ERROR"],
  ];
  for (const [err, status, code] of cases) {
    assert.deepEqual(importErrorResponse(err), { status, body: { error: err.message, code } }, code);
  }
});

test("a non-Error throw is a 500 with the generic message", () => {
  assert.deepEqual(importErrorResponse("secret detail"), { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } });
});
