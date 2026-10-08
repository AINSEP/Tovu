import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { startTestServer } from "./helpers/http-test-server.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes } from "../inbound/admin-http/dev-auth.js";
import type { RouteDeps } from "../routes/types.js";

/**
 * @file Route-level failure-path tests for `POST /api/admin/v1/auth/logout`. Express 4 does not
 * catch a rejected async handler, so a logout whose identity bootstrap or session store fails used
 * to leave the request hanging until the client gave up. These pin the same flat 500 body the
 * sibling login route returns. Every fetch carries a timeout so a regression fails fast instead of
 * stalling the suite.
 */

const FETCH_TIMEOUT_MS = 3_000;

function buildTestApp(overrides: Partial<RouteDeps>): express.Express {
  const deps: RouteDeps = { ...createRouteDeps(), ...overrides };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  return app;
}

async function postLogout(baseUrl: string, cookie?: string): Promise<Response> {
  return fetch(`${baseUrl}/api/admin/v1/auth/logout`, {
    method: "POST",
    headers: cookie ? { cookie } : {},
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

test("logout: an identity bootstrap that rejects answers 500 instead of hanging", async (t) => {
  const identityReady = Promise.reject(new Error("seed failed"));
  identityReady.catch(() => {});
  const baseUrl = await startTestServer(buildTestApp({ identityReady }), t);

  const res = await postLogout(baseUrl, "tovu_session=abc");

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error" });
});

test("logout: a session store that rejects answers 500 instead of hanging", async (t) => {
  const real = createRouteDeps();
  // Delegates every other method to the real repo; only the lookup logout performs first fails.
  const sessionRepo: RouteDeps["sessionRepo"] = Object.assign(Object.create(real.sessionRepo), {
    findByTokenHash: async () => {
      throw new Error("db down");
    },
  });
  const baseUrl = await startTestServer(buildTestApp({ sessionRepo }), t);

  const res = await postLogout(baseUrl, "tovu_session=abc");

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error" });
});

test("logout: without a cookie it clears the cookie and answers ok", async (t) => {
  const baseUrl = await startTestServer(buildTestApp({}), t);

  const res = await postLogout(baseUrl);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get("set-cookie"), "tovu_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict");
});
