/**
 * @file Request-shape and failure arms of `import.ts` the ceremony suites
 * (`publish-content-import-routes.test.ts` and friends) do not reach: the routes mounted on an app
 * with no JSON body parser (they own their own "missing body" answer rather than crashing), an
 * `overwriteEntityKeys` list over the 1000-key cap, and a run-status read whose store fails.
 * The routes are mounted on a bare Express app with a principal set in `res.locals`, the same rig
 * as `backstop-import-ui.routes.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerPublishContentImportRoutes } from "../import.js";
import type { PublishContentRouteDeps } from "../deps.js";

const BASE = "/api/admin/v1/workspaces/ws/publish-content";

function routeApp(options: { jsonBody: boolean; deps?: Partial<Record<string, unknown>> }): express.Express {
  const deps = {
    workspaceId: "ws",
    authorize: async () => ({ allowed: true, reason: "fixture" }),
    ...options.deps,
  } as unknown as PublishContentRouteDeps;
  const app = express();
  if (options.jsonBody) app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
  registerPublishContentImportRoutes(app, deps);
  return app;
}

async function post(server: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${server}${BASE}${path}`, {
    method: "POST",
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}

test("mounted without a body parser, plan/confirm/execute answer 400 with their own validation text", async (t) => {
  const server = await startTestServer(routeApp({ jsonBody: false }), t);
  assert.deepEqual(await post(server, "/import/plan"), { status: 400, body: { error: "'bundleId' (string) is required", code: "VALIDATION_ERROR" } });
  assert.deepEqual(await post(server, "/import/confirm"), { status: 400, body: { error: "'planId' and 'planHash' (strings) are required", code: "VALIDATION_ERROR" } });
  assert.deepEqual(await post(server, "/import/execute"), { status: 400, body: { error: "'bundleId' and 'confirmationToken' (strings) are required", code: "VALIDATION_ERROR" } });
});

test("an overwriteEntityKeys list over 1000 keys is refused; exactly 1000 strings passes the shape check", async (t) => {
  const server = await startTestServer(routeApp({ jsonBody: true }), t);
  const over = await post(server, "/import/plan", { bundleId: "b-1", overwriteEntityKeys: Array.from({ length: 1001 }, (_, i) => `post:${i}`) });
  assert.deepEqual(over, { status: 400, body: { error: "'overwriteEntityKeys' must be an array of strings", code: "VALIDATION_ERROR" } });
  // At the cap the request gets past validation and fails later, on the deliberately empty deps.
  const atCap = await post(server, "/import/plan", { bundleId: "b-1", overwriteEntityKeys: Array.from({ length: 1000 }, (_, i) => `post:${i}`) });
  assert.notEqual(atCap.status, 400);
});

test("a run-status read whose store fails answers 500 INTERNAL_ERROR with the store's message", async (t) => {
  const failing = new Proxy({}, { get: () => async () => { throw new Error("run store unavailable"); } });
  const server = await startTestServer(routeApp({ jsonBody: true, deps: { publishContentRunRepo: failing } }), t);
  const res = await fetch(`${server}${BASE}/runs/run-1`);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "run store unavailable", code: "INTERNAL_ERROR" });
});
