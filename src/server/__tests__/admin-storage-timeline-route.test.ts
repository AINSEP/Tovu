import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "./helpers/http-test-server";
import { InMemoryStorageLedgerRepo } from "../../features/storage/repo.memory";
import { createRouteDeps } from "../app";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth";
import { registerAdminStorageTimelineRoute } from "../routes/admin/storage/timeline";
import type { RouteDeps } from "../routes/types";

/**
 * @file Route-level test for `GET /api/admin/v1/storage/timeline` (ADR-041 §1, Slice 3 of this
 * session's dispatch). Mirrors `admin-integrations-routes.test.ts`'s pattern:
 * `createRouteDeps()` for a real `authorize()` + identity repos, real auth middleware, a real
 * login before hitting the route.
 */

function buildTestApp(ledger = new InMemoryStorageLedgerRepo()): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = { ...createRouteDeps(), storageLedgerRepo: ledger };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminStorageTimelineRoute(app, deps);

  return { app, deps };
}

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string) {
  await deps.identityReady;
  const bareId = "bare-principal-storage-timeline";
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
    username: "bare-storage-timeline",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-storage-timeline", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("storage timeline route: returns an empty page before any ledger row exists", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/storage/timeline`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: unknown[]; nextCursor: string | null };
  assert.deepEqual(body.items, []);
  assert.equal(body.nextCursor, null);
});

test("storage timeline route: renders real ledger rows, newest-first, through the real authorize() gate", async (t) => {
  const ledger = new InMemoryStorageLedgerRepo();
  await ledger.append({ id: "led-1", kind: "core.migration", createdAt: "2026-07-15T00:00:00.000Z", restorePointId: null, outcome: "success" });
  await ledger.append({ id: "led-2", kind: "restore.executed", createdAt: "2026-07-15T00:01:00.000Z", restorePointId: "rp-1", outcome: "success" });

  const { app } = buildTestApp(ledger);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/storage/timeline`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: Array<{ id: string }> };
  assert.deepEqual(body.items.map((row) => row.id), ["led-2", "led-1"]);
});

test("storage timeline route: a caller with zero grants is rejected FORBIDDEN (storage.read, REQ-01)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/storage/timeline`, { headers: { cookie: bareCookie } });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

test("storage timeline route: a limit above the server's 200-row cap is rejected VALIDATION_ERROR (REQ-04)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/storage/timeline?limit=500`, { headers: { cookie } });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});
