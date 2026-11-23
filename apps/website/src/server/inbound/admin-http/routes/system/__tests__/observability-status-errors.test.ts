import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminObservabilityStatusRoute, type AdminObservabilityStatusDeps } from "#src/server/runtime/composition/http-app/mount-admin-system";

for (const method of ["get", "post"] as const) test(`observability ${method} owns one redacted correlated report`, async t => {
  const cause = new Error("telemetry context password=TELEMETRY_CANARY");
  const reports: unknown[] = [];
  const logs = t.mock.method(console, "error", () => {});
  const tracker = { error: (...args: unknown[]) => reports.push(args) };
  const app = express();
  registerAdminObservabilityStatusRoute({ app, deps: portFake<AdminObservabilityStatusDeps>({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "owner" }), observabilityEnabled: () => { throw cause; }, sendTelemetryTest: async () => { throw cause; }, tracker }) });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "owner" }; res.locals.adminFailureTracker = tracker;
  const path = method === "get" ? "observability-status" : "observability/test-error";
  await extractRouteHandler(app, method, `/api/admin/v1/workspaces/:workspaceId/system/${path}`)({ params: { workspaceId: "ws" } }, res);
  const body = capture.jsonBody as { errorId: string };
  assert.equal(capture.statusCode, 500);
  assert.equal(reports.length, 1);
  assert.equal(logs.mock.calls.length, 1);
  assert.ok(JSON.stringify(reports).includes(body.errorId));
  assert.doesNotMatch(JSON.stringify(capture) + JSON.stringify(reports) + JSON.stringify(logs.mock.calls), /TELEMETRY_CANARY/);
});
