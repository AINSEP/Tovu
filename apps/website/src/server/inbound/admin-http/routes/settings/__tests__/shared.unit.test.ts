import { assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import assert from "node:assert/strict";
import test from "node:test";

import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import {
  CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION,
  resolveUserLayerReadTarget,
  respondToSettingsError,
} from "../shared.js";

/**
 * @file Direct tests for the settings routes' shared helpers. The route suites
 * (`settings-workspace-scoping.test.ts`, `settings-read-scoping.test.ts`, `settings-auth.test.ts`)
 * reach the mismatch rejection and the mapped error codes, but never the unmapped-error fallback staying a fixed 500 instead of echoing an internal message.
 */

const deps = { workspaceId: "workspace-local" };

test("resolveUserLayerReadTarget: reading your own layer (or none) never asks authorize", async () => {
  let calls = 0;
  const authorize = async () => {
    calls += 1;
    return { allowed: false as const, reason: "should not be asked" };
  };
  assert.deepEqual(await resolveUserLayerReadTarget({ ...deps, authorize }, { requestedPrincipalId: undefined, callerPrincipalId: "me" }), {
    allowed: true,
    principalId: undefined,
  });
  assert.deepEqual(await resolveUserLayerReadTarget({ ...deps, authorize }, { requestedPrincipalId: "me", callerPrincipalId: "me" }), {
    allowed: true,
    principalId: "me",
  });
  assert.equal(calls, 0);
});

test("resolveUserLayerReadTarget: another principal's layer requires settings.user.read and relays the denial reason", async () => {
  const seen: Array<Record<string, unknown>> = [];
  const authorizeWith = (allowed: boolean) => async (params: Record<string, unknown>) => {
    seen.push(params);
    return allowed ? { allowed: true as const, reason: "matched" } : { allowed: false as const, reason: "no_grant" };
  };
  assert.deepEqual(
    await resolveUserLayerReadTarget({ ...deps, authorize: authorizeWith(false) }, { requestedPrincipalId: "them", callerPrincipalId: "me" }),
    { allowed: false, reason: "no_grant" }
  );
  assert.deepEqual(
    await resolveUserLayerReadTarget({ ...deps, authorize: authorizeWith(true) }, { requestedPrincipalId: "them", callerPrincipalId: "me" }),
    { allowed: true, principalId: "them" }
  );
  assert.equal(CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION, "settings.user.read");
  assert.deepEqual(seen[0], { principalId: "me", permission: "settings.user.read", workspaceId: "workspace-local", entityType: "setting-value" });
});

class FirstError extends Error {}
class SecondError extends Error {}

test("respondToSettingsError: the first matching mapping wins and carries the error's own message", () => {
  const { res, capture } = createCapturingResponse();
  respondToSettingsError({ res, err: new SecondError("definition 'x' is gone"), mappings: [
    { matches: (e) => e instanceof FirstError, status: 404, code: "FIRST" },
    { matches: (e) => e instanceof SecondError, status: 409, code: "SECOND" },
    { matches: () => true, status: 400, code: "CATCH_ALL" },
  ] });
  assert.equal(capture.statusCode, 409);
  assert.deepEqual(capture.jsonBody, { error: "definition 'x' is gone", code: "SECOND" });
});

test("respondToSettingsError: an unmapped error is a fixed 500 that never echoes its message", () => {
  const { res, capture } = createCapturingResponse();
  respondToSettingsError({ res, err: new Error("connection to db at postgres://secret@host failed"), mappings: [
    { matches: (e) => e instanceof FirstError, status: 404, code: "FIRST" },
  ] });
  assert.equal(capture.statusCode, 500);
  assertAdminResponse({ actual: capture.jsonBody, expected: { error: "The settings request could not finish.", code: "INTERNAL_ERROR" } }, { failure: {"message":"The settings request could not finish.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"setting operation"} });
});
