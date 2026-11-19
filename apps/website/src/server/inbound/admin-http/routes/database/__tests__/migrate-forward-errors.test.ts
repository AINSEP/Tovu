import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminDatabaseMigrateForwardRoutes } from "../migrate-forward.js";
import { TokenExpiredError } from "#src/contracts/core/gated-mutations/token";

for (const typed of [false, true]) test(`migration failure retains ${typed ? "typed refusal" : "one private incident"}`, async t => {
  const cause = typed ? new TokenExpiredError({ message: "expired migration token" }) : new Error("migration context password=MIGRATE_CANARY");
  const logs = t.mock.method(console, "error", () => {});
  const app = express();
  const deps = portFake<RouteDeps>({ workspaceId: "ws", authorize: async () => { throw cause; }, gatedMutations: { gatewayDeps: portFake<RouteDeps["gatedMutations"]["gatewayDeps"]>({ authorize: async () => { throw cause; }, authorizeInstance: async () => { throw cause; } }) } });
  registerAdminDatabaseMigrateForwardRoutes({ app, deps });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "owner" };
  await extractRouteHandler(app, "post", "/api/admin/v1/database/migrate-forward/execute")({ body: { confirmationToken: "token" }, params: {} }, res);
  const body = capture.jsonBody as { code: string; errorId?: string; error: string };
  assert.equal(capture.statusCode, typed ? 409 : 500);
  assert.equal(body.code, typed ? "TOKEN_EXPIRED" : "INTERNAL_ERROR");
  assert.equal(logs.mock.calls.length, typed ? 0 : 1);
  if (typed) assert.equal(body.error, cause.message);
  else assert.ok(JSON.stringify(logs.mock.calls).includes(body.errorId!));
  assert.doesNotMatch(JSON.stringify(capture) + JSON.stringify(logs.mock.calls), /MIGRATE_CANARY/);
});
