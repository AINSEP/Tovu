import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { registerAdminAnalyticsRecentHitsRoute } from "../../admin-http/routes/analytics/recent-hits.js";
import { registerAdminFormsPullSubmissionsRoute } from "../../admin-http/routes/forms/pull-submissions.js";

function appWithPrincipal() {
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.requestId = "request-123"; next(); });
  return app;
}

test("analytics retains its canonical error and the shared incident reference", async t => {
  const logged = t.mock.method(console, "error", () => {});
  const app = appWithPrincipal();
  registerAdminAnalyticsRecentHitsRoute(app, { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }),
    analyticsSink: { list: async () => { throw new Error("PRIVATE_SINK password=SECRET_CANARY"); } } as never });
  const response = await dispatchJsonRequest(app, "GET", "/api/admin/v1/workspaces/ws/analytics/recent-hits");
  assert.equal(response.status, 500);
  const body = response.body as any;
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.equal(body.error.requestId, "request-123");
  assert.match(body.error.message, /analytics/i);
  const failure = body.error.details.failure;
  assert.equal(body.error.details.errorId, failure.errorId);
  assert.match(body.error.message, new RegExp(failure.errorId));
  assert.equal(failure.cause, "The error ID identifies the server report.");
  assert.equal(logged.mock.callCount(), 1);
  assert.equal((logged.mock.calls[0].arguments[1] as any).errorId, failure.errorId);
  for (const canary of ["PRIVATE_SINK", "SECRET_CANARY"]) assert.equal(JSON.stringify(body).includes(canary), false);
});

test("forms pull gives its formatter the concrete explanation and correlated reference", async t => {
  const logged = t.mock.method(console, "error", () => {});
  const app = appWithPrincipal();
  registerAdminFormsPullSubmissionsRoute(app, { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }),
    formSubmissionsPull: { pull: async () => { throw new Error("PRIVATE_PULL password=SECRET_CANARY"); } } } as never);
  const response = await dispatchJsonRequest(app, "POST", "/api/admin/v1/workspaces/ws/forms/submissions/pull");
  assert.equal(response.status, 500);
  const body = response.body as any;
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.details.failure.message, "Form submission retrieval stopped before any published host was read.");
  assert.equal(body.details.failure.errorId, body.errorId);
  assert.equal(body.details.failure.step, "forms.submissions.pull");
  assert.equal(body.details.failure.cause, "The error ID identifies the server report.");
  assert.equal(body.error, `${body.details.failure.message} ${body.details.failure.action} (error ${body.errorId})`);
  assert.equal(logged.mock.callCount(), 1);
  assert.equal((logged.mock.calls[0].arguments[1] as any).errorId, body.errorId);
  for (const canary of ["PRIVATE_PULL", "SECRET_CANARY"]) assert.equal(JSON.stringify(body).includes(canary), false);
});
