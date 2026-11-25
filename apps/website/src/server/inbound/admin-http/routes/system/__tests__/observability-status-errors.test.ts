import { recordingComposedReporter } from "#src/server/__tests__/helpers/composed-reporter-probe";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminObservabilityStatusRoute, type AdminObservabilityStatusDeps } from "#src/server/runtime/composition/http-app/mount-admin-system";

for (const method of ["get", "post"] as const) test(`observability ${method} owns one redacted correlated report`, async t => {
  const recorded = recordingComposedReporter();
  const routeErrors = { ...createRouteIncidentReporter().errors, reporter: recorded.reporter };
  const cause = new Error("telemetry context password=TELEMETRY_CANARY");
  const reports: unknown[] = [];
  const logs = t.mock.method(console, "error", () => {});
  const tracker = { error: (...args: unknown[]) => reports.push(args) };
  const app = express();
  registerAdminObservabilityStatusRoute({ errors: routeErrors, app, deps: portFake<AdminObservabilityStatusDeps>({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "owner" }), observabilityEnabled: () => { throw cause; }, sendTelemetryTest: async () => { throw cause; }, tracker }) });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "owner" }; res.locals.adminFailureTracker = tracker;
  const path = method === "get" ? "observability-status" : "observability/test-error";
  await extractRouteHandler(app, method, `/api/admin/v1/workspaces/:workspaceId/system/${path}`)({ params: { workspaceId: "ws" } }, res);
  const body = capture.jsonBody as { errorId: string };
  assert.equal(capture.statusCode, 500);
  assert.equal(recorded.reports.length, 1);
  assert.equal(recorded.records.length, 1);
  assert.ok(JSON.stringify(recorded.reports).includes(body.errorId));
  assert.doesNotMatch(JSON.stringify(capture) + JSON.stringify(recorded.reports) + JSON.stringify(recorded.records), /TELEMETRY_CANARY/);
});
