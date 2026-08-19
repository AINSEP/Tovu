import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "./helpers/http-test-server.js";
import { InMemoryDatabaseLedgerRepo } from "../../features/database/repo.memory.js";
import { createRouteDeps } from "../app.js";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth.js";
import { registerAdminDatabaseTimelineRoute } from "../routes/admin/database/timeline.js";
import type { RouteDeps } from "../routes/types.js";

/**
 * @file Route-level test for `GET /api/admin/v1/database/timeline` (ADR-041 §1, Slice 3 of this
 * session's dispatch). Mirrors `admin-integrations-routes.test.ts`'s pattern:
 * `createRouteDeps()` for a real `authorize()` + identity repos, real auth middleware, a real
 * login before hitting the route.
 */

function buildTestApp(ledger = new InMemoryDatabaseLedgerRepo()): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = { ...createRouteDeps(), databaseLedgerRepo: ledger };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminDatabaseTimelineRoute(app, deps);

  return { app, deps };
}

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string) {
  await deps.identityReady;
  const bareId = "bare-principal-database-timeline";
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username: "bare-database-timeline",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-database-timeline", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("database timeline route: returns an empty page before any ledger row exists", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/timeline`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: unknown[]; nextCursor: string | null };
  assert.deepEqual(body.items, []);
  assert.equal(body.nextCursor, null);
});

test("database timeline route: renders real ledger rows, newest-first, through the real authorize() gate", async (t) => {
  const ledger = new InMemoryDatabaseLedgerRepo();
  await ledger.append({ id: "led-1", kind: "core.migration", createdAt: "2026-07-15T00:00:00.000Z", restorePointId: null, outcome: "success" });
  await ledger.append({ id: "led-2", kind: "restore.executed", createdAt: "2026-07-15T00:01:00.000Z", restorePointId: "rp-1", outcome: "success" });

  const { app } = buildTestApp(ledger);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/timeline`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: Array<{ id: string }> };
  assert.deepEqual(body.items.map((row) => row.id), ["led-2", "led-1"]);
});

test("database timeline route: a caller with zero grants is rejected FORBIDDEN (database.read, REQ-01)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/timeline`, { headers: { cookie: bareCookie } });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

test("database timeline route: a limit above the server's 200-row cap is rejected VALIDATION_ERROR (REQ-04)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/timeline?limit=500`, { headers: { cookie } });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});
