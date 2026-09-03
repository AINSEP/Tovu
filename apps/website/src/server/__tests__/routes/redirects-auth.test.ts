import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server.js";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminRedirectCreateRoute } from "../../inbound/admin-http/routes/redirects/create.js";
import { registerAdminRedirectGetRoute } from "../../inbound/admin-http/routes/redirects/get-by-id.js";
import { registerAdminRedirectHitsRoute } from "../../inbound/admin-http/routes/redirects/hits.js";
import { registerAdminRedirectImportRoute } from "../../inbound/admin-http/routes/redirects/import.js";
import { registerAdminRedirectListRoute } from "../../inbound/admin-http/routes/redirects/list.js";
import { registerAdminRedirectTombstoneRoute } from "../../inbound/admin-http/routes/redirects/tombstone.js";
import { registerAdminRedirectUpdateRoute } from "../../inbound/admin-http/routes/redirects/update.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file T025 (REQ-12) — each of the 7 admin `redirects` endpoints, without
 * `admin.redirects.manage`, returns 403 FORBIDDEN. Mirrors
 * `forms-auth.test.ts`'s pattern exactly.
 */

const WORKSPACE_ID = "workspace-local";

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminRedirectListRoute(app, deps);
  registerAdminRedirectGetRoute(app, deps);
  registerAdminRedirectCreateRoute(app, deps);
  registerAdminRedirectUpdateRoute(app, deps);
  registerAdminRedirectTombstoneRoute(app, deps);
  registerAdminRedirectImportRoute(app, deps);
  registerAdminRedirectHitsRoute(app, deps);
  return { app, deps };
}

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string, suffix: string) {
  await deps.identityReady;
  const bareId = `bare-principal-redirects-${suffix}`;
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  const username = `bare-redirects-${suffix}`;
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("all 7 admin redirects endpoints deny 403 FORBIDDEN without admin.redirects.manage", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl, "1");

  const seeded = await deps.redirectRepo.save({
    record: {
      id: "seed-1",
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/seed",
      toTarget: "/target",
      statusCode: 301,
      status: "active",
      override: false,
      priority: 0,
      source: "manual",
      createdByPrincipal: "system",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
      version: 1,
    },
    revision: {
      redirectId: "seed-1",
      workspaceId: WORKSPACE_ID,
      seq: 1,
      state: {
        id: "seed-1",
        workspaceId: WORKSPACE_ID,
        matchType: "exact",
        fromPattern: "/seed",
        toTarget: "/target",
        statusCode: 301,
        status: "active",
        override: false,
        priority: 0,
        source: "manual",
        createdByPrincipal: "system",
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z",
        version: 1,
      },
      tombstoned: false,
      actorId: "system",
      recordedAt: "2026-07-13T00:00:00.000Z",
    },
  });
  void seeded;

  const checks: Array<[string, string, string?]> = [
    ["GET", `/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects`],
    ["GET", `/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/seed-1`],
    ["POST", `/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects`, JSON.stringify({ matchType: "exact", fromPattern: "/a", toTarget: "/b", statusCode: 301 })],
    ["PATCH", `/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/seed-1`, JSON.stringify({ toTarget: "/c" })],
    ["DELETE", `/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/seed-1`],
    [
      "POST",
      `/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/import`,
      JSON.stringify({ rules: [{ matchType: "exact", fromPattern: "/imp", toTarget: "/t", statusCode: 301 }] }),
    ],
    ["GET", `/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/seed-1/hits`],
  ];

  for (const [method, path, body] of checks) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", cookie: bareCookie },
      body,
    });
    assert.equal(res.status, 403, `${method} ${path} should be 403`);
    const json = await res.json();
    assert.equal(json.code, "FORBIDDEN");
  }
});

test("admin redirects update route: workspace mismatch, update happy path, undefined optionals, not found, loop error, unexpected error", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Seed a redirect
  await deps.redirectRepo.save({
    record: {
      id: "up-1",
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/old-path",
      toTarget: "/new-path",
      statusCode: 301,
      status: "active",
      override: false,
      priority: 0,
      source: "manual",
      createdByPrincipal: "system",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
      version: 1,
    },
    revision: {
      redirectId: "up-1",
      workspaceId: WORKSPACE_ID,
      seq: 1,
      state: {
        id: "up-1",
        workspaceId: WORKSPACE_ID,
        matchType: "exact",
        fromPattern: "/old-path",
        toTarget: "/new-path",
        statusCode: 301,
        status: "active",
        override: false,
        priority: 0,
        source: "manual",
        createdByPrincipal: "system",
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z",
        version: 1,
      },
      tombstoned: false,
      actorId: "system",
      recordedAt: "2026-07-13T00:00:00.000Z",
    },
  });

  // 1. Workspace mismatch -> 404
  const mismatchRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/redirects/up-1`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ toTarget: "/target" }),
  });
  assert.equal(mismatchRes.status, 404);
  const mismatchJson = await mismatchRes.json();
  assert.equal(mismatchJson.error, "workspace was not found");

  // 2. Happy path with all optional fields provided
  const patchRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/up-1`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      matchType: "exact",
      fromPattern: "/old-path",
      toTarget: "/updated-target",
      statusCode: 302,
      status: "inactive",
      override: true,
      priority: 5,
    }),
  });
  assert.equal(patchRes.status, 200);
  const patchedJson = (await patchRes.json()) as { data: { toTarget: string; statusCode: number; status: string; override: boolean; priority: number } };
  assert.equal(patchedJson.data.toTarget, "/updated-target");
  assert.equal(patchedJson.data.statusCode, 302);
  assert.equal(patchedJson.data.status, "inactive");
  assert.equal(patchedJson.data.override, true);
  assert.equal(patchedJson.data.priority, 5);

  // 3. Happy path without optional override/priority (tests undefined branches)
  const patchRes2 = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/up-1`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      toTarget: "/updated-target-2",
    }),
  });
  assert.equal(patchRes2.status, 200);
  const patchedJson2 = (await patchRes2.json()) as { data: { toTarget: string } };
  assert.equal(patchedJson2.data.toTarget, "/updated-target-2");

  // 4. Not found -> 404
  const notFoundRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/non-existent`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ toTarget: "/new" }),
  });
  assert.equal(notFoundRes.status, 404);
  const notFoundJson = (await notFoundRes.json()) as { code: string };
  assert.equal(notFoundJson.code, "REDIRECT_NOT_FOUND");

  // 5. Validation error (loop error) -> 409
  const loopRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/up-1`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fromPattern: "/loop", toTarget: "/loop" }),
  });
  assert.equal(loopRes.status, 409);
  const loopJson = (await loopRes.json()) as { code: string };
  assert.equal(loopJson.code, "REDIRECT_LOOP_DETECTED");

  // 6. Unexpected error in catch block -> 500
  const origFindById = deps.redirectRepo.findById.bind(deps.redirectRepo);
  deps.redirectRepo.findById = async () => {
    throw new Error("unexpected error");
  };
  try {
    const errorRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/up-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ toTarget: "/new-target" }),
    });
    assert.equal(errorRes.status, 500);
    const errorJson = (await errorRes.json()) as { code: string };
    assert.equal(errorJson.code, "INTERNAL_ERROR");
  } finally {
    deps.redirectRepo.findById = origFindById;
  }
});

test("admin redirects import route: workspace mismatch, batch-size validation, all-created, partial failure, unexpected error", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const importUrl = `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/import`;
  const post = (body: unknown) =>
    fetch(importUrl, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });

  // 1. Workspace mismatch -> 404 (checked before any body validation).
  const mismatchRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/redirects/import`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ rules: [] }),
  });
  assert.equal(mismatchRes.status, 404);
  assert.equal((await mismatchRes.json()).error, "workspace was not found");

  // 2. Top-level shape validation -> 400 VALIDATION_ERROR: not an array, too few, too many.
  for (const rules of [undefined, "not-an-array", []]) {
    const res = await post({ rules });
    assert.equal(res.status, 400, `rules=${JSON.stringify(rules)} should be 400`);
    assert.equal(((await res.json()) as { code: string }).code, "VALIDATION_ERROR");
  }
  const tooMany = await post({ rules: Array.from({ length: 501 }, (_, i) => ({ matchType: "exact", fromPattern: `/r${i}`, toTarget: "/t", statusCode: 301 })) });
  assert.equal(tooMany.status, 400);
  assert.equal(((await tooMany.json()) as { code: string }).code, "VALIDATION_ERROR");

  // 3. Every rule valid -> 207 with all created, none failed.
  const okRes = await post({
    rules: [
      { matchType: "exact", fromPattern: "/import-a", toTarget: "/target-a", statusCode: 301 },
      { matchType: "exact", fromPattern: "/import-b", toTarget: "/target-b", statusCode: 302 },
    ],
  });
  assert.equal(okRes.status, 207);
  const okBody = (await okRes.json()) as { created: Array<{ fromPattern: string }>; failed: unknown[] };
  assert.equal(okBody.created.length, 2);
  assert.equal(okBody.failed.length, 0);
  assert.deepEqual(okBody.created.map((r) => r.fromPattern).sort(), ["/import-a", "/import-b"]);

  // 4. A per-item failure never aborts the batch (EC-08): the duplicate `fromPattern` fails on its
  // own, the first item still commits, and the response is still 207 (never a top-level error).
  const partialRes = await post({
    rules: [
      { matchType: "exact", fromPattern: "/import-dup", toTarget: "/target-c", statusCode: 301 },
      { matchType: "exact", fromPattern: "/import-dup", toTarget: "/target-d", statusCode: 301 },
    ],
  });
  assert.equal(partialRes.status, 207);
  const partialBody = (await partialRes.json()) as {
    created: Array<{ fromPattern: string }>;
    failed: Array<{ index: number; code: string }>;
  };
  assert.equal(partialBody.created.length, 1);
  assert.equal(partialBody.created[0]?.fromPattern, "/import-dup");
  assert.equal(partialBody.failed.length, 1);
  assert.deepEqual(partialBody.failed[0], { index: 1, code: "REDIRECT_CONFLICT", message: partialBody.failed[0]?.message });
  assert.match(partialBody.failed[0]?.message ?? "", /already exists/);

  // 5. An unexpected error before the import runs (e.g. authorize() throwing) is a 500, not a 207.
  const origAuthorize = deps.authorize;
  deps.authorize = async () => {
    throw new Error("boom");
  };
  try {
    const errRes = await post({ rules: [{ matchType: "exact", fromPattern: "/import-e", toTarget: "/target-e", statusCode: 301 }] });
    assert.equal(errRes.status, 500);
    assert.deepEqual(await errRes.json(), { error: "internal error", code: "INTERNAL_ERROR" });
  } finally {
    deps.authorize = origAuthorize;
  }
});

/**
 * `req.params.workspaceId ?? ""` (extractRouteHandler's own doc, `helpers/http-test-server.ts`):
 * Express guarantees a matched `:param` is always a populated string, so the right side of this
 * `??` is unreachable through any real HTTP request. Restored 2026-09-03 after being wrongly
 * deleted as "unreachable dead code" -- the repo's established answer is to KEEP the guard and
 * exercise it with a hand-built `req` that deliberately violates Express's own routing contract.
 */
test("admin redirects import route: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call", async () => {
  const { app } = buildTestApp();
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/redirects/import");
  const { res, capture } = createCapturingResponse();

  await handler({ params: {}, body: { rules: [] } }, res);

  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { error: string }).error, "workspace was not found");
});

test("admin redirects get-by-id route: workspace mismatch, found, not found, unexpected error", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await deps.redirectRepo.save({
    record: {
      id: "get-1",
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/old-get",
      toTarget: "/new-get",
      statusCode: 301,
      status: "active",
      override: false,
      priority: 0,
      source: "manual",
      createdByPrincipal: "system",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
      version: 1,
    },
    revision: {
      redirectId: "get-1",
      workspaceId: WORKSPACE_ID,
      seq: 1,
      state: {
        id: "get-1",
        workspaceId: WORKSPACE_ID,
        matchType: "exact",
        fromPattern: "/old-get",
        toTarget: "/new-get",
        statusCode: 301,
        status: "active",
        override: false,
        priority: 0,
        source: "manual",
        createdByPrincipal: "system",
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z",
        version: 1,
      },
      tombstoned: false,
      actorId: "system",
      recordedAt: "2026-07-13T00:00:00.000Z",
    },
  });

  // 1. Workspace mismatch -> 404
  const mismatchRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/redirects/get-1`, {
    headers: { cookie },
  });
  assert.equal(mismatchRes.status, 404);
  const mismatchJson = await mismatchRes.json();
  assert.equal(mismatchJson.error, "workspace was not found");

  // 2. Found -> 200
  const foundRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/get-1`, {
    headers: { cookie },
  });
  assert.equal(foundRes.status, 200);
  const foundJson = (await foundRes.json()) as { data: { id: string; fromPattern: string; toTarget: string } };
  assert.equal(foundJson.data.id, "get-1");
  assert.equal(foundJson.data.fromPattern, "/old-get");
  assert.equal(foundJson.data.toTarget, "/new-get");

  // 3. Not found -> 404
  const notFoundRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/does-not-exist`, {
    headers: { cookie },
  });
  assert.equal(notFoundRes.status, 404);
  const notFoundJson = (await notFoundRes.json()) as { code: string };
  assert.equal(notFoundJson.code, "REDIRECT_NOT_FOUND");

  // 4. Unexpected error -> 500
  const origFindById = deps.redirectRepo.findById.bind(deps.redirectRepo);
  deps.redirectRepo.findById = async () => {
    throw new Error("unexpected error");
  };
  try {
    const errorRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/get-1`, {
      headers: { cookie },
    });
    assert.equal(errorRes.status, 500);
    const errorJson = (await errorRes.json()) as { code: string };
    assert.equal(errorJson.code, "INTERNAL_ERROR");
  } finally {
    deps.redirectRepo.findById = origFindById;
  }
});

test("admin redirects tombstone route: workspace mismatch, happy path, not found, unexpected error", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await deps.redirectRepo.save({
    record: {
      id: "del-1",
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: "/del-path",
      toTarget: "/del-target",
      statusCode: 301,
      status: "active",
      override: false,
      priority: 0,
      source: "manual",
      createdByPrincipal: "system",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
      version: 1,
    },
    revision: {
      redirectId: "del-1",
      workspaceId: WORKSPACE_ID,
      seq: 1,
      state: {
        id: "del-1",
        workspaceId: WORKSPACE_ID,
        matchType: "exact",
        fromPattern: "/del-path",
        toTarget: "/del-target",
        statusCode: 301,
        status: "active",
        override: false,
        priority: 0,
        source: "manual",
        createdByPrincipal: "system",
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z",
        version: 1,
      },
      tombstoned: false,
      actorId: "system",
      recordedAt: "2026-07-13T00:00:00.000Z",
    },
  });

  // 1. Workspace mismatch -> 404
  const mismatchRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/redirects/del-1`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(mismatchRes.status, 404);
  const mismatchJson = await mismatchRes.json();
  assert.equal(mismatchJson.error, "workspace was not found");

  // 1b. Forbidden -> 403
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl, "tombstone-bare");
  const forbidRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/del-1`, {
    method: "DELETE",
    headers: { cookie: bareCookie },
  });
  assert.equal(forbidRes.status, 403);
  const forbidJson = (await forbidRes.json()) as { code: string };
  assert.equal(forbidJson.code, "FORBIDDEN");

  // 2. Happy path tombstone -> 200
  const delRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/del-1`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(delRes.status, 200);
  const delJson = (await delRes.json()) as { data: { id: string; status: string } };
  assert.equal(delJson.data.id, "del-1");
  assert.equal(delJson.data.status, "disabled");

  // 3. Not found -> 404
  const notFoundRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/non-existent-del`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(notFoundRes.status, 404);
  const notFoundJson = (await notFoundRes.json()) as { code: string };
  assert.equal(notFoundJson.code, "REDIRECT_NOT_FOUND");

  // 4. Unexpected error -> 500
  const origFindById = deps.redirectRepo.findById.bind(deps.redirectRepo);
  deps.redirectRepo.findById = async () => {
    throw new Error("unexpected error");
  };
  try {
    const errorRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/del-1`, {
      method: "DELETE",
      headers: { cookie },
    });
    assert.equal(errorRes.status, 500);
    const errorJson = (await errorRes.json()) as { code: string };
    assert.equal(errorJson.code, "INTERNAL_ERROR");
  } finally {
    deps.redirectRepo.findById = origFindById;
  }
});
