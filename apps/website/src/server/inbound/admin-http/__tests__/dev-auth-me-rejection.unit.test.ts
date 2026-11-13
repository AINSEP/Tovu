import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";
import { createRouteDeps } from "../../../runtime/composition/app.js";
import { captureRouteError } from "../../shared/observability-middleware.js";
import { registerAuthRoutes } from "../dev-auth.js";

// REGRESSION (hung async route): a session read that fails before the handler answers used to leave
// GET /auth/me open until the browser gave up, because Express 4 drops a rejected async handler.
test("GET /auth/me answers the plain-words failure when the identity store cannot be read", async (t) => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const failing = { ...deps };
  Object.defineProperty(failing, "identityReady", { get: () => Promise.reject(new Error("identity store unreachable")) });
  t.mock.method(console, "error", () => {});
  const app = express();
  registerAuthRoutes(app, failing);
  app.use(captureRouteError);
  const baseUrl = await startTestServer(app, t);

  // A hang is the bug; the client timeout turns it into a failed assertion instead of a stuck test.
  const response = await fetch(`${baseUrl}/api/admin/v1/auth/me`, {
    headers: { cookie: "tovu_session=any-token" }, signal: AbortSignal.timeout(2_000),
  });
  assert.equal(response.status, 500);
  const body = await response.json() as { code?: unknown; error?: unknown };
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.doesNotMatch(String(body.error), /identity store unreachable/, "the raw cause stays in the logs");
});
