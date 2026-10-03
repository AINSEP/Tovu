import assert from "node:assert/strict";
import test from "node:test";

import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import {
  CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION,
  resolveTargetWorkspaceId,
  resolveUserLayerReadTarget,
  respondToSettingsError,
} from "../shared.js";

/**
 * @file Direct tests for the settings routes' shared helpers. The route suites
 * (`settings-workspace-scoping.test.ts`, `settings-read-scoping.test.ts`, `settings-auth.test.ts`)
 * reach the mismatch rejection and the mapped error codes, but never: a `scope: "global"` write
 * resolving to NO workspace (a regression that pins it to the route's workspace silently turns a
 * site-wide setting into a per-workspace one), a blank body `workspaceId` counting as "not named",
 * or the unmapped-error fallback staying a fixed 500 instead of echoing an internal message.
 */

const deps = { workspaceId: "workspace-local" };

test("resolveTargetWorkspaceId: a global-scope write targets no workspace, even when the body names this one", () => {
  assert.deepEqual(resolveTargetWorkspaceId(deps, { bodyWorkspaceId: undefined, scope: "global" }), { ok: true, workspaceId: undefined });
  assert.deepEqual(resolveTargetWorkspaceId(deps, { bodyWorkspaceId: "workspace-local", scope: "global" }), { ok: true, workspaceId: undefined });
});

test("resolveTargetWorkspaceId: a non-global write always targets the route's own workspace", () => {
  assert.deepEqual(resolveTargetWorkspaceId(deps, { bodyWorkspaceId: undefined, scope: "workspace" }), { ok: true, workspaceId: "workspace-local" });
  assert.deepEqual(resolveTargetWorkspaceId(deps, { bodyWorkspaceId: "workspace-local", scope: "user" }), { ok: true, workspaceId: "workspace-local" });
});

test("resolveTargetWorkspaceId: null and empty-string body workspaceIds count as not named, not as a mismatch", () => {
  for (const blank of [null, ""]) {
    assert.deepEqual(resolveTargetWorkspaceId(deps, { bodyWorkspaceId: blank, scope: "workspace" }), { ok: true, workspaceId: "workspace-local" });
  }
});

test("resolveTargetWorkspaceId: any other named workspace is refused, for every scope including global", () => {
  for (const scope of ["global", "workspace", "user"] as const) {
    assert.deepEqual(resolveTargetWorkspaceId(deps, { bodyWorkspaceId: "workspace-other", scope }), {
      ok: false,
      error: "workspaceId 'workspace-other' does not match this route's workspace; a settings write cannot target another workspace",
    });
  }
});

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
  respondToSettingsError(res, new SecondError("definition 'x' is gone"), [
    { matches: (e) => e instanceof FirstError, status: 404, code: "FIRST" },
    { matches: (e) => e instanceof SecondError, status: 409, code: "SECOND" },
    { matches: () => true, status: 400, code: "CATCH_ALL" },
  ]);
  assert.equal(capture.statusCode, 409);
  assert.deepEqual(capture.jsonBody, { error: "definition 'x' is gone", code: "SECOND" });
});

test("respondToSettingsError: an unmapped error is a fixed 500 that never echoes its message", () => {
  const { res, capture } = createCapturingResponse();
  respondToSettingsError(res, new Error("connection to db at postgres://secret@host failed"), [
    { matches: (e) => e instanceof FirstError, status: 404, code: "FIRST" },
  ]);
  assert.equal(capture.statusCode, 500);
  assert.deepEqual(capture.jsonBody, { error: "internal error", code: "INTERNAL_ERROR" });
});
