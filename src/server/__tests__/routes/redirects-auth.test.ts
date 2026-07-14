import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../app";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminRedirectCreateRoute } from "../../routes/admin/redirects/create";
import { registerAdminRedirectGetRoute } from "../../routes/admin/redirects/get-by-id";
import { registerAdminRedirectHitsRoute } from "../../routes/admin/redirects/hits";
import { registerAdminRedirectImportRoute } from "../../routes/admin/redirects/import";
import { registerAdminRedirectListRoute } from "../../routes/admin/redirects/list";
import { registerAdminRedirectTombstoneRoute } from "../../routes/admin/redirects/tombstone";
import { registerAdminRedirectUpdateRoute } from "../../routes/admin/redirects/update";
import type { RouteDeps } from "../../routes/types";

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

async function bootAuthenticated(app: express.Express, t: import("node:test").TestContext) {
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  return { baseUrl, cookie };
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
