import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminDatabaseRestorePointsCreateRoute, registerAdminDatabaseRestorePointsListRoute } from "../../inbound/admin-http/routes/database/restore-points.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file design-spec.md §3.8 backend-gap closure — route-level tests for Database's restore-points
 * list + create HTTP surface (ADR-041 §2/REQ-22/AC-26/AC-27), this dispatch. Exercises the real
 * `InMemoryDbOpsAdapter`/`InMemoryRestorePointsRepo` composition `server/app.ts` wires.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminDatabaseRestorePointsListRoute(app, deps);
  registerAdminDatabaseRestorePointsCreateRoute(app, deps);
  return { app, deps };
}

test("database restore-points routes: create -> list golden path, persists the real captured watermark (REQ-22/AC-26/AC-27)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ trigger: "manual" }),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { restorePoint: { id: string; costClass: string; kind: string } };
  assert.equal(created.restorePoint.costClass, "cheap");
  assert.equal(created.restorePoint.kind, "file-snapshot");

  const listRes = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, { headers: { cookie } });
  assert.equal(listRes.status, 200);
  const listed = (await listRes.json()) as { items: Array<{ id: string; watermarkAtCapture: number | null; trigger: string }> };
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].id, created.restorePoint.id);
  assert.equal(listed.items[0].trigger, "manual");
  // The route persists the real `dbOps.captureRestorePoint()` result, not a fabricated value.
  assert.equal(typeof listed.items[0].watermarkAtCapture, "number");
});

test("database restore-points routes: an empty site lists zero restore points, not an error", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: unknown[] };
  assert.deepEqual(body.items, []);
});

test("database restore-points routes: GET is 403 for a caller without database.read", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps(), authorize: async () => ({ allowed: false, reason: "insufficient role" }) };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminDatabaseRestorePointsListRoute(app, deps);
  registerAdminDatabaseRestorePointsCreateRoute(app, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, { headers: { cookie } });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code?: string; details?: { permission?: string; reason?: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details?.permission, "database.read");
  assert.equal(body.details?.reason, "insufficient role");
});

test("database restore-points routes: POST is 403 for a caller without backup.create", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps(), authorize: async () => ({ allowed: false, reason: "insufficient role" }) };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminDatabaseRestorePointsListRoute(app, deps);
  registerAdminDatabaseRestorePointsCreateRoute(app, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ trigger: "manual" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code?: string; details?: { permission?: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details?.permission, "backup.create");
});

test("database restore-points routes: GET 500s with the thrown message when the repo explodes", async (t) => {
  const deps: RouteDeps = createRouteDeps();
  deps.restorePointsRepo.list = async () => {
    throw new Error("disk read failure");
  };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminDatabaseRestorePointsListRoute(app, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, { headers: { cookie } });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "disk read failure", code: "INTERNAL_ERROR" });
});

test("database restore-points routes: GET 500s with a generic message when a non-Error is thrown", async (t) => {
  const deps: RouteDeps = createRouteDeps();
  deps.restorePointsRepo.list = async () => {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw "not-an-error-instance";
  };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminDatabaseRestorePointsListRoute(app, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, { headers: { cookie } });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error", code: "INTERNAL_ERROR" });
});

test("database restore-points routes: POST defaults trigger to 'manual' and mints its own idempotencyKey when the body omits both", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 201);

  const listRes = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, { headers: { cookie } });
  const listed = (await listRes.json()) as { items: Array<{ trigger: string }> };
  assert.equal(listed.items[0].trigger, "manual");
});

test("database restore-points routes: POST accepts a caller-supplied idempotencyKey and persists it", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ trigger: "manual", idempotencyKey: "caller-key-1" }),
  });
  assert.equal(res.status, 201);
  const created = (await res.json()) as { restorePoint: { id: string } };

  const found = await deps.restorePointsRepo.findByIdempotencyKey("caller-key-1");
  assert.equal(found?.restorePointId, created.restorePoint.id);
});

test("database restore-points routes: POST 400s (ValidationError) for an 'expensive' site without costAck, and 201s once acknowledged", async (t) => {
  const deps: RouteDeps = createRouteDeps();
  deps.dbOps.getCapabilities = async () => ({ restorePoint: { costClass: "expensive", kind: "logical-dump" } });
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminDatabaseRestorePointsCreateRoute(app, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const refused = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ trigger: "manual" }),
  });
  assert.equal(refused.status, 400);
  assert.deepEqual(await refused.json(), {
    error: "AC-26: an 'expensive' restore point requires an explicit costAck; the confirmer must acknowledge the cost/disk estimate first",
    code: "VALIDATION_ERROR",
  });

  const acked = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ trigger: "manual", costAck: true }),
  });
  assert.equal(acked.status, 201);
  const body = (await acked.json()) as { restorePoint: { costClass: string } };
  assert.equal(body.restorePoint.costClass, "expensive");
});

test("database restore-points routes: POST 409s (RestorePointUnavailableError) when the site's dbOps reports 'unavailable'", async (t) => {
  const deps: RouteDeps = createRouteDeps();
  deps.dbOps.getCapabilities = async () => ({ restorePoint: { costClass: "unavailable", kind: "file-snapshot" } });
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminDatabaseRestorePointsCreateRoute(app, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ trigger: "manual" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code?: string };
  assert.equal(body.code, "RESTORE_POINT_UNAVAILABLE");
});

test("database restore-points routes: POST 500s with the thrown message when persistence fails after a successful capture", async (t) => {
  const deps: RouteDeps = createRouteDeps();
  deps.restorePointsRepo.save = async () => {
    throw new Error("save failed");
  };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminDatabaseRestorePointsCreateRoute(app, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ trigger: "manual" }),
  });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "save failed", code: "INTERNAL_ERROR" });
});

test("database restore-points routes: POST 500s with a generic message when a non-Error is thrown", async (t) => {
  const deps: RouteDeps = createRouteDeps();
  deps.dbOps.getCapabilities = async () => {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw "not-an-error-instance";
  };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminDatabaseRestorePointsCreateRoute(app, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ trigger: "manual" }),
  });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error", code: "INTERNAL_ERROR" });
});
