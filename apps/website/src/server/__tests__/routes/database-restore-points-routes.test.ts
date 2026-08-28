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
