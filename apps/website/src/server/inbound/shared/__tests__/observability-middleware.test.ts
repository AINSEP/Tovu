import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { applyRequestTracking } from "../observability-middleware.js";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";
import type { ObservabilityPort, RequestTrackingInput, RequestTrackingOutcome } from "#src/platform/observability/index";

/**
 * @file Unit coverage for `applyRequestTracking` in isolation from the full `createApp()`
 * composition root — a minimal real Express app (not `createApp()`'s ~308 routes) is enough to
 * exercise the real Express routing behavior (`req.route`, `req.baseUrl`, `res.on("finish")`) this
 * middleware depends on; faking those would only re-implement Express's own routing internals
 * incorrectly. `server/runtime/composition/__tests__/observability-wiring.test.ts` separately
 * proves this middleware is actually WIRED into both real composition roots.
 */

function createSpyObservabilityPort(): {
  port: ObservabilityPort;
  calls: Array<{ input: RequestTrackingInput; outcome: RequestTrackingOutcome }>;
} {
  const calls: Array<{ input: RequestTrackingInput; outcome: RequestTrackingOutcome }> = [];
  const port: ObservabilityPort = {
    trackRequest(input) {
      return {
        end(outcome) {
          calls.push({ input, outcome });
        },
      };
    },
  };
  return { port, calls };
}

function buildTestApp(observability: ObservabilityPort): express.Express {
  const app = express();
  applyRequestTracking(app, { observability });
  app.get("/welcome", (_req, res) => res.status(200).send("ok"));
  app.post("/error", (_req, res) => res.status(500).json({ ok: false }));
  const adminRouter = express.Router();
  adminRouter.get("/posts/:id", (_req, res) => res.status(200).json({ ok: true }));
  app.use("/api/admin", adminRouter);
  return app;
}

test("records method, raw path, and status for a top-level matched route", async (t) => {
  const { port, calls } = createSpyObservabilityPort();
  const baseUrl = await startTestServer(buildTestApp(port), t);

  const res = await fetch(`${baseUrl}/welcome`);
  assert.equal(res.status, 200);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.method, "GET");
  assert.equal(calls[0].input.path, "/welcome");
  assert.equal(calls[0].outcome.statusCode, 200);
  assert.equal(calls[0].outcome.routePattern, "/welcome");
});

test("reconstructs the FULL mount-aware route pattern for a route registered on a sub-router (req.baseUrl + req.route.path), not just the router-local pattern", async (t) => {
  const { port, calls } = createSpyObservabilityPort();
  const baseUrl = await startTestServer(buildTestApp(port), t);

  const res = await fetch(`${baseUrl}/api/admin/posts/abc123`);
  assert.equal(res.status, 200);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].outcome.routePattern, "/api/admin/posts/:id");
});

test('an unmatched request (no route resolves, Express\'s default 404) reports the fixed literal "unmatched", not the raw (unbounded, attacker-controlled) path', async (t) => {
  const { port, calls } = createSpyObservabilityPort();
  const baseUrl = await startTestServer(buildTestApp(port), t);

  const res = await fetch(`${baseUrl}/this/does/not/exist`);
  assert.equal(res.status, 404);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].outcome.routePattern, "unmatched");
  assert.equal(
    calls[0].input.path,
    "/this/does/not/exist",
    "input.path is recorded at request-start (before routing), so it still carries the raw path for attribute-level detail even when nothing matches"
  );
});

test("a 500 response from a matched route is recorded with its real status code", async (t) => {
  const { port, calls } = createSpyObservabilityPort();
  const baseUrl = await startTestServer(buildTestApp(port), t);

  const res = await fetch(`${baseUrl}/error`, { method: "POST" });
  assert.equal(res.status, 500);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].outcome.statusCode, 500);
  assert.equal(calls[0].outcome.routePattern, "/error");
});

test("two concurrent in-flight requests are tracked independently — one request's outcome never contaminates another's", async (t) => {
  const { port, calls } = createSpyObservabilityPort();
  const baseUrl = await startTestServer(buildTestApp(port), t);

  const [welcomeRes, errorRes] = await Promise.all([fetch(`${baseUrl}/welcome`), fetch(`${baseUrl}/error`, { method: "POST" })]);
  assert.equal(welcomeRes.status, 200);
  assert.equal(errorRes.status, 500);

  assert.equal(calls.length, 2);
  const welcomeCall = calls.find((c) => c.outcome.routePattern === "/welcome");
  const errorCall = calls.find((c) => c.outcome.routePattern === "/error");
  assert.equal(welcomeCall?.outcome.statusCode, 200);
  assert.equal(errorCall?.outcome.statusCode, 500);
});
