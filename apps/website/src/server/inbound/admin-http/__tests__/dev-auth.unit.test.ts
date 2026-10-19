import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express, { type Request, type Response } from "express";

import { createCapturingResponse, extractRouteHandler, startTestServer } from "../../../__tests__/helpers/http-test-server.js";
import { createRouteDeps } from "../../../runtime/composition/app.js";
import {
  currentCredential,
  getAuthedCredentialKind,
  getAuthedPrincipal,
  registerAuthRoutes,
  requireAdminSession,
  type OperatorPrincipalRecord,
} from "../dev-auth.js";

// Pins dev-auth.ts:307 — a missing principal is a route-wiring error.
test("getAuthedPrincipal throws the wiring error when absent and returns the attached record unchanged", () => {
  assert.throws(() => getAuthedPrincipal({ locals: {} } as Response), {
    message: "getAuthedPrincipal: no principal on res.locals — requireAdminSession must run before this route",
  });

  const principal: OperatorPrincipalRecord = {
    id: "api-key-principal",
    workspaceId: "workspace-local",
    kind: "api_key",
    displayName: "Auth helper probe",
    status: "active",
    createdAt: "2026-10-15T12:00:00.000Z",
  };
  assert.strictEqual(getAuthedPrincipal({ locals: { principal } } as unknown as Response), principal);
});

// Pins dev-auth.ts:326 — a missing credential kind is a route-wiring error.
test("getAuthedCredentialKind throws the wiring error when absent and returns the attached api_key kind", () => {
  assert.throws(() => getAuthedCredentialKind({ locals: {} } as Response), {
    message: "getAuthedCredentialKind: no credential kind on res.locals — requireAdminSession must run before this route",
  });
  assert.equal(getAuthedCredentialKind({ locals: { authCredentialKind: "api_key" } } as unknown as Response), "api_key");
});

// Pins dev-auth.ts:273 — absent/non-key Authorization must stop before API-key parsing.
test("requests without a key resolve to null and receive the exact 401 without calling next", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const middleware = requireAdminSession(deps);

  for (const headers of [{ authorization: "Basic dXNlcjpwYXNz" }, {}]) {
    const req = { headers, socket: { localPort: 0 } } as Request;
    const { res, capture } = createCapturingResponse();
    const nextCalls: unknown[][] = [];

    await middleware(req, res, (...args: unknown[]) => { nextCalls.push(args); });

    assert.equal(capture.statusCode, 401);
    assert.deepEqual(capture.jsonBody, { error: "unauthenticated", code: "UNAUTHENTICATED" });
    assert.deepEqual(nextCalls, []);
    assert.strictEqual(await currentCredential(deps, req), null);
  }
});

// Pins dev-auth.ts:637 — await the handler so a null-principal dereference fails instead of hanging HTTP.
test("GET /auth/me directly returns the exact 401 for an unauthenticated request", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const app = express();
  registerAuthRoutes(app, deps);
  const handler = extractRouteHandler(app, "get", "/api/admin/v1/auth/me");
  const { res, capture } = createCapturingResponse();

  await handler({ headers: {}, socket: { localPort: 0 } }, res);

  assert.equal(capture.statusCode, 401);
  assert.deepEqual(capture.jsonBody, { error: "unauthenticated", code: "UNAUTHENTICATED" });
});

// Pins dev-auth.ts:699 — await the handler so a null-principal dereference fails instead of hanging HTTP.
test("GET /auth/me/password-status directly returns the exact 401 for an unauthenticated request", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const app = express();
  registerAuthRoutes(app, deps);
  const handler = extractRouteHandler(app, "get", "/api/admin/v1/auth/me/password-status");
  const { res, capture } = createCapturingResponse();

  await handler({ headers: {}, socket: { localPort: 0 } }, res);

  assert.equal(capture.statusCode, 401);
  assert.deepEqual(capture.jsonBody, { error: "unauthenticated", code: "UNAUTHENTICATED" });
});

test("malformed authorization schemes never authenticate and invalid bearer keys fail closed", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  for (const authorization of ["Bearer", "Bearer  ", "ApiKey", "Bearer one two", "Bearer invalid-key", "ApiKey invalid-key"]) {
    const req = { headers: { authorization }, socket: { localPort: 0 } } as Request;
    assert.equal(await currentCredential(deps, req), null, authorization);
    const { res, capture } = createCapturingResponse();
    let nextCalls = 0;
    await requireAdminSession(deps)(req, res, () => { nextCalls++; });
    assert.deepEqual(capture, { statusCode: 401, jsonBody: { error: "unauthenticated", code: "UNAUTHENTICATED" } });
    assert.deepEqual(res.locals, {});
    assert.equal(nextCalls, 0);
  }
});

test("password login without a User-Agent still creates a usable session without invented client metadata", async (t) => {
  const { request } = await import("node:http");
  const deps = createRouteDeps();
  await deps.identityReady;
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  const base = await startTestServer(app, t);
  const save = t.mock.method(deps.sessionRepo, "save");
  const response = await new Promise<{ status: number | undefined; cookie: string; body: string }>((resolve, reject) => {
    const req = request(`${base}/api/admin/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { body += chunk; });
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode, cookie: res.headers["set-cookie"]?.[0]?.split(";")[0] ?? "", body }));
    });
    req.on("error", reject);
    req.end(JSON.stringify({ username: "admin", password: "tovu-dev" }));
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { user: { id: await deps.ownerPrincipalId, username: "admin" } });
  assert.equal(save.mock.callCount(), 1);
  const saved = save.mock.calls[0].arguments[0];
  const stored = await deps.sessionRepo.findById({ workspaceId: deps.workspaceId, id: saved.id });
  assert.ok(stored);
  assert.equal(stored.userAgent, undefined);
  const me = await fetch(`${base}/api/admin/v1/auth/me`, { headers: { cookie: response.cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.id, await deps.ownerPrincipalId);
});
