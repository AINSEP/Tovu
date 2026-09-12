import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { AGENT_DAEMON_TOKEN_ENV_VAR, requireAgentDaemonToken } from "#src/assistant/daemon-auth";
import { FEDERATION_RELOAD_PATH, registerFederationReloadRoute } from "../federation-reload-route.js";

/**
 * @file Route-level tests for `POST /api/federation/reload`.
 *
 * Same two-piece composition as `federation-admissions-route.unit.test.ts` (gate first, route
 * second, no live daemon) and the same reason: `agent-daemon-server.ts` cannot be imported by a test.
 * This proves the auth wiring, that a successful reload's `newlyAdmittedConnectionIds` reaches the
 * caller verbatim, and — the feature's own hard requirement — that a rejected `reload()` is reported
 * as a real failure rather than swallowed into a false 200.
 */

const TOKEN = "test-daemon-token";

function buildApp(reload: () => Promise<{ newlyAdmittedConnectionIds: readonly string[] }>): express.Express {
  const app = express();
  app.use(requireAgentDaemonToken({ env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: TOKEN } }));
  registerFederationReloadRoute(app, { reload });
  return app;
}

function postReload(baseUrl: string, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${FEDERATION_RELOAD_PATH}`, { method: "POST", headers });
}

test("rejects a request with no bearer token — 401, same daemon-wide gate as every other route", async (t) => {
  const baseUrl = await startTestServer(
    buildApp(async () => ({ newlyAdmittedConnectionIds: [] })),
    t,
  );

  const res = await postReload(baseUrl);

  assert.equal(res.status, 401);
});

test("with the correct bearer token, relays a successful reload's newlyAdmittedConnectionIds verbatim", async (t) => {
  const baseUrl = await startTestServer(
    buildApp(async () => ({ newlyAdmittedConnectionIds: ["higgsfield"] })),
    t,
  );

  const res = await postReload(baseUrl, { authorization: `Bearer ${TOKEN}` });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, newlyAdmittedConnectionIds: ["higgsfield"] });
});

test("a reload() with nothing new to admit still answers 200 with an empty list, not an error", async (t) => {
  const baseUrl = await startTestServer(
    buildApp(async () => ({ newlyAdmittedConnectionIds: [] })),
    t,
  );

  const res = await postReload(baseUrl, { authorization: `Bearer ${TOKEN}` });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, newlyAdmittedConnectionIds: [] });
});

test("a rejected reload() is reported as a real failure — never a silent 200 — per the feature's visible-failure requirement", async (t) => {
  const baseUrl = await startTestServer(
    buildApp(async () => {
      throw new Error("simulated roster read failure");
    }),
    t,
  );

  const res = await postReload(baseUrl, { authorization: `Bearer ${TOKEN}` });

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { ok: false, error: "federation reload failed" });
});
