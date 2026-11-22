import assert from "node:assert/strict";
import test from "node:test";

import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { authorizeDirectOrRespond, authorizeOrRespond } from "../authorize-guard.js";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Direct unit coverage for `authorizeOrRespond` (extracted 2026-08-18 from 125+ near-identical
 * route call sites — see that file's header). Until now this helper was only exercised indirectly
 * through the 3 routes that already call it (`integrations/create.ts`, `integrations/pause.ts`,
 * `seo/put-entry.ts`); this file locks its own contract directly so a future edit to the helper
 * can't silently change the shared 403 body every consuming route depends on.
 *
 * Asserts byte-for-byte parity with the inline block this replaces (see e.g.
 * `routes/menus/create.ts`'s pre-extraction shape): same status code, same `error`/`code`/`details`
 * fields, same return-value contract (`true` = continue, `false` = already responded).
 */

const PARAMS_BASE = {
  principalId: "principal-1",
  permission: "widget.manage",
  workspaceId: "workspace-1",
  entityType: "widget",
};

test("authorizeOrRespond: allowed grant returns true and writes nothing to res", async () => {
  const { res, capture } = createCapturingResponse();
  const authorize: RouteDeps["authorize"] = async () => ({ allowed: true, reason: "matched" });

  const result = await authorizeOrRespond({ res, authorize, params: PARAMS_BASE });

  assert.equal(result, true);
  // Untouched capture defaults (see createCapturingResponse's doc) prove status()/json() were
  // never called on the allowed path.
  assert.equal(capture.statusCode, 200);
  assert.equal(capture.jsonBody, undefined);
});

test("authorizeOrRespond: denied grant writes the exact 403 FORBIDDEN body and returns false", async () => {
  const { res, capture } = createCapturingResponse();
  const authorize: RouteDeps["authorize"] = async () => ({ allowed: false, reason: "no_grant" });

  const result = await authorizeOrRespond({ res, authorize, params: PARAMS_BASE });

  assert.equal(result, false);
  assert.equal(capture.statusCode, 403);
  assert.deepEqual(capture.jsonBody, {
    error: "principal 'principal-1' is not authorized for 'widget.manage' (no_grant)",
    code: "FORBIDDEN",
    details: { permission: "widget.manage", reason: "no_grant" },
  });
});

test("authorizeOrRespond: entityId is optional — denied body omits nothing when entityId is absent", async () => {
  const { res, capture } = createCapturingResponse();
  const authorize: RouteDeps["authorize"] = async () => ({ allowed: false, reason: "no_grant" });

  await authorizeOrRespond({ res, authorize, params: PARAMS_BASE });

  const body = capture.jsonBody as { details: { permission: string; reason: string } };
  assert.deepEqual(body.details, { permission: "widget.manage", reason: "no_grant" });
});

test("authorizeOrRespond: entityId, when present, is forwarded to authorize() unchanged", async () => {
  const { res } = createCapturingResponse();
  let receivedParams: unknown;
  const authorize: RouteDeps["authorize"] = async (params) => {
    receivedParams = params;
    return { allowed: true, reason: "matched" };
  };

  await authorizeOrRespond({ res, authorize, params: { ...PARAMS_BASE, entityId: "widget-42" } });

  assert.deepEqual(receivedParams, { ...PARAMS_BASE, entityId: "widget-42" });
});

test("authorizeOrRespond: entityType is optional — a collection-level call with neither entityType nor entityId still authorizes and denies correctly", async () => {
  const { res, capture } = createCapturingResponse();
  const collectionParams = {
    principalId: "principal-1",
    permission: "content.read",
    workspaceId: "workspace-1",
  };
  let receivedParams: unknown;
  const denyingAuthorize: RouteDeps["authorize"] = async (params) => {
    receivedParams = params;
    return { allowed: false, reason: "no_grant" };
  };

  const result = await authorizeOrRespond({ res, authorize: denyingAuthorize, params: collectionParams });

  assert.equal(result, false);
  assert.deepEqual(receivedParams, collectionParams);
  assert.deepEqual(capture.jsonBody, {
    error: "principal 'principal-1' is not authorized for 'content.read' (no_grant)",
    code: "FORBIDDEN",
    details: { permission: "content.read", reason: "no_grant" },
  });

  const allowingAuthorize: RouteDeps["authorize"] = async () => ({ allowed: true, reason: "matched" });
  const { res: res2 } = createCapturingResponse();
  assert.equal(await authorizeOrRespond({ res: res2, authorize: allowingAuthorize, params: collectionParams }), true);
});

test("authorizeOrRespond: the denial reason is interpolated into the error message even when empty", async () => {
  const { res, capture } = createCapturingResponse();
  const authorize: RouteDeps["authorize"] = async () => ({ allowed: false, reason: "" });

  await authorizeOrRespond({ res, authorize, params: PARAMS_BASE });

  assert.deepEqual(capture.jsonBody, {
    error: "principal 'principal-1' is not authorized for 'widget.manage' ()",
    code: "FORBIDDEN",
    details: { permission: "widget.manage", reason: "" },
  });
});

test("authorizeOrRespond: publishing grants allow only their capabilities regardless of ambient RBAC", async () => {
  const context = { sourceInstallationId: "source-installation", capabilities: ["publish_content.import"], entityTypes: ["post"], generation: 2 };
  const allowed = createCapturingResponse();
  allowed.res.locals.publishTrust = context;
  let ambientCalls = 0;
  const ambientDeny: RouteDeps["authorize"] = async () => { ambientCalls += 1; return { allowed: false, reason: "no_grant" }; };
  assert.equal(await authorizeOrRespond({ res: allowed.res, authorize: ambientDeny, params: { ...PARAMS_BASE, permission: "publish_content.import" } }), true);
  assert.equal(allowed.capture.jsonBody, undefined);
  const denied = createCapturingResponse();
  denied.res.locals.publishTrust = context;
  const ambientAllow: RouteDeps["authorize"] = async () => { ambientCalls += 1; return { allowed: true, reason: "wildcard" }; };
  assert.equal(await authorizeOrRespond({ res: denied.res, authorize: ambientAllow, params: { ...PARAMS_BASE, permission: "content.write" } }), false);
  assert.equal(denied.capture.statusCode, 403);
  assert.deepEqual(denied.capture.jsonBody, {
    error: "principal 'principal-1' is not authorized for 'content.write' ('content.write' is outside this publishing grant)",
    code: "FORBIDDEN", details: { permission: "content.write", reason: "'content.write' is outside this publishing grant" },
  });
  assert.equal(ambientCalls, 0, "publishing authority cannot inherit ambient grants");
});

// `authorizeDirectOrRespond` (dedupe plan, group RG2): the ~85 routes that hand-rolled
// `deps.authorize()` + the 403 block never consulted the publishing-credential override, and
// switching them to `authorizeOrRespond` is an authorization change for the owner, not a refactor.
// These pin both halves: the same 403 body, and the ambient `authorize` is still the one asked.

test("authorizeDirectOrRespond: denial writes the same 403 body authorizeOrRespond writes", async () => {
  const deny: RouteDeps["authorize"] = async () => ({ allowed: false, reason: "no_grant" });
  const direct = createCapturingResponse();
  const guarded = createCapturingResponse();
  assert.equal(await authorizeDirectOrRespond({ res: direct.res, authorize: deny, params: PARAMS_BASE }), false);
  assert.equal(await authorizeOrRespond({ res: guarded.res, authorize: deny, params: PARAMS_BASE }), false);
  assert.equal(direct.capture.statusCode, 403);
  assert.deepEqual(direct.capture.jsonBody, guarded.capture.jsonBody);
  assert.deepEqual(direct.capture.jsonBody, {
    error: "principal 'principal-1' is not authorized for 'widget.manage' (no_grant)",
    code: "FORBIDDEN",
    details: { permission: "widget.manage", reason: "no_grant" },
  });
});

test("authorizeDirectOrRespond: allowed returns true and writes nothing", async () => {
  const { res, capture } = createCapturingResponse();
  const allow: RouteDeps["authorize"] = async () => ({ allowed: true, reason: "matched" });
  assert.equal(await authorizeDirectOrRespond({ res, authorize: allow, params: PARAMS_BASE }), true);
  assert.equal(capture.jsonBody, undefined);
});

test("authorizeDirectOrRespond: ignores a publishing grant and asks the ambient authorize (unchanged route behavior)", async () => {
  const context = { sourceInstallationId: "source-installation", capabilities: ["publish_content.import"], entityTypes: ["post"], generation: 2 };
  const { res } = createCapturingResponse();
  res.locals.publishTrust = context;
  let ambientCalls = 0;
  const ambientAllow: RouteDeps["authorize"] = async () => { ambientCalls += 1; return { allowed: true, reason: "wildcard" }; };
  assert.equal(await authorizeDirectOrRespond({ res, authorize: ambientAllow, params: { ...PARAMS_BASE, permission: "content.write" } }), true);
  assert.equal(ambientCalls, 1);
});
