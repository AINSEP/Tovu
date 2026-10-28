import { createTracker } from "@jini-ai/diagnostics/observability/node";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import { createNoopObservabilityPort, type ErrorReport, type ObservabilityPort } from "@jini-ai/diagnostics/observability";

import { applyRequestTracking, captureRouteError } from "../observability-middleware.js";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";

/**
 * @file The request's error report (provider wave 2): a 5xx response is reported ONCE to
 * `ObservabilityPort.reportError` with the route template, method, status, request id and principal
 * id — and nothing from the request itself (headers, cookies, query, body).
 */

function recording(): { port: ObservabilityPort; reports: ErrorReport[] } {
  const reports: ErrorReport[] = [];
  // The operation tracker must be a real (non-noop) one so `trackAsyncOperation` reports.
  return { reports, port: { ...createNoopObservabilityPort({}), trackOperation: () => ({ run: fn => fn(), end: () => {} }), reportError: (report) => { reports.push(report); } } };
}

// Built at runtime so no secret-shaped literal sits in the repo.
const secret = ["sk", "live", "R".repeat(12) + "y".repeat(12)].join("_");

async function boot(t: test.TestContext, port: ObservabilityPort): Promise<string> {
  const app = express();
  applyRequestTracking(app, { tracker: createTracker({ observability: port }), env: { TOVU_LOG_REQUESTS: undefined, TOVU_LOG_SLOW_REQUESTS: undefined } });
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "principal-1", email: "owner@example.test" }; next(); });
  app.post("/api/things/:id", () => { throw new Error("handler exploded"); });
  app.get("/api/handled", (_req, res) => { res.status(503).json({ error: "down" }); });
  app.get("/api/missing", (_req, res) => { res.status(404).end(); });
  app.post("/api/publish", async (_req, res) => {
    await createTracker({ observability: port }).trace({ name: "site.publish", run: async () => { throw new Error("publish failed"); } })
      .catch(() => res.status(500).json({ error: "publish failed" }));
  });
  app.use(captureRouteError);
  return startTestServer(app, t);
}

const sensitive = { headers: { authorization: `Bearer ${secret}`, cookie: `session=${secret}`, "content-type": "application/json" }, body: JSON.stringify({ password: secret }) };

test("an unhandled route error is reported once, with the route template and ids only", async (t) => {
  const { port, reports } = recording();
  const baseUrl = await boot(t, port);
  const response = await fetch(`${baseUrl}/api/things/42?token=${secret}`, { method: "POST", ...sensitive });
  assert.equal(response.status, 500);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reports.length, 1);
  const [report] = reports;
  assert.equal((report!.error as Error).message, "handler exploded");
  assert.deepEqual(report!.context, { operation: "http.request", attributes: {
    route: "/api/things/:id", method: "POST", status: 500, requestId: response.headers.get("x-request-id"), principalId: "principal-1",
  } });
  const sent = JSON.stringify({ context: report!.context, message: (report!.error as Error).message, stack: (report!.error as Error).stack });
  for (const absent of [secret, "owner@example.test", "/api/things/42", "token="]) assert.ok(!sent.includes(absent), `report carries ${absent}`);
});

test("a 5xx a handler answers itself is reported as a stackless marker; a 4xx is not reported", async (t) => {
  const { port, reports } = recording();
  const baseUrl = await boot(t, port);
  assert.equal((await fetch(`${baseUrl}/api/missing`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/handled`, { headers: sensitive.headers })).status, 503);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reports.length, 1);
  assert.equal((reports[0]!.error as Error).name, "ServerErrorResponse");
  assert.equal((reports[0]!.error as Error).message, "HTTP 503 from GET /api/handled");
  assert.ok(!JSON.stringify(reports).includes(secret));
});

test("a request whose tracked operation already reported is not reported again as a 5xx", async (t) => {
  const { port, reports } = recording();
  const baseUrl = await boot(t, port);
  assert.equal((await fetch(`${baseUrl}/api/publish`, { method: "POST" })).status, 500);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(reports.map(({ context }) => context.operation), ["site.publish"]);
});
