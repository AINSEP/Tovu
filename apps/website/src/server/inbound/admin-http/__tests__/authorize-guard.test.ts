import assert from "node:assert/strict";
import test from "node:test";

import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { authorizeOrRespond } from "../authorize-guard.js";
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

  const result = await authorizeOrRespond(res, authorize, PARAMS_BASE);

  assert.equal(result, true);
  // Untouched capture defaults (see createCapturingResponse's doc) prove status()/json() were
  // never called on the allowed path.
  assert.equal(capture.statusCode, 200);
  assert.equal(capture.jsonBody, undefined);
});

test("authorizeOrRespond: denied grant writes the exact 403 FORBIDDEN body and returns false", async () => {
  const { res, capture } = createCapturingResponse();
  const authorize: RouteDeps["authorize"] = async () => ({ allowed: false, reason: "no_grant" });

  const result = await authorizeOrRespond(res, authorize, PARAMS_BASE);

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

  await authorizeOrRespond(res, authorize, PARAMS_BASE);

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

  await authorizeOrRespond(res, authorize, { ...PARAMS_BASE, entityId: "widget-42" });

  assert.deepEqual(receivedParams, { ...PARAMS_BASE, entityId: "widget-42" });
});

test("authorizeOrRespond: the denial reason is interpolated into the error message even when empty", async () => {
  const { res, capture } = createCapturingResponse();
  const authorize: RouteDeps["authorize"] = async () => ({ allowed: false, reason: "" });

  await authorizeOrRespond(res, authorize, PARAMS_BASE);

  assert.deepEqual(capture.jsonBody, {
    error: "principal 'principal-1' is not authorized for 'widget.manage' ()",
    code: "FORBIDDEN",
    details: { permission: "widget.manage", reason: "" },
  });
});
