import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { DatabaseIntrospectionPort, SchemaStateSummary } from "../../../features/database/adapter.sqlite.js";
import { InMemoryDatabaseIntrospectionAdapter } from "../../../features/database/repo.memory.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminDatabaseSchemaStateRoute } from "../../inbound/admin-http/routes/database/schema-state.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Route-level test for `GET /api/admin/v1/database/schema-state` (ADR-041 §3) — the read-only
 * surface that finally makes `db/drift.ts`'s `getDriftStatus` classification visible to a human.
 *
 * Before this route existed, `DatabaseIntrospectionPort.getSchemaState()` was reachable only from
 * the `database_get_schema_state` AGENT tool (`features/database/tool-registrations.ts`) — a site
 * owner whose database had diverged onto a different migration lineage had no admin-UI surface
 * that would ever tell them. See `apps/admin/src/features/database/Database.tsx`'s own header,
 * which recorded the drift banner as having "no route yet".
 *
 * Harness mirrors `admin-database-timeline-route.test.ts` exactly: `createRouteDeps()` for a real
 * `authorize()` + identity repos, the real auth middleware, a real login before hitting the route.
 *
 * The honesty cases (`"unknown"`, and the port throwing) are the point of this file, not padding —
 * the whole reason to build the route is that a wrong "everything is fine" is worse than no answer
 * at all.
 */

/** A `DatabaseIntrospectionPort` double that reports exactly the schema state a test names, or
 *  throws exactly the error a test names. Only `getSchemaState` is exercised by this route. */
function stubIntrospection(outcome: SchemaStateSummary | { throws: Error }): DatabaseIntrospectionPort {
  return {
    async getSchemaState() {
      if ("throws" in outcome) throw outcome.throws;
      return outcome;
    },
    async getHealth() {
      throw new Error("getHealth is not part of this route's surface");
    },
    async listPendingMigrations() {
      throw new Error("listPendingMigrations is not part of this route's surface");
    },
  };
}

function buildTestApp(introspection: DatabaseIntrospectionPort = new InMemoryDatabaseIntrospectionAdapter()): {
  app: express.Express;
  deps: RouteDeps;
} {
  const deps: RouteDeps = { ...createRouteDeps(), databaseIntrospection: introspection };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminDatabaseSchemaStateRoute(app, deps);

  return { app, deps };
}

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string) {
  await deps.identityReady;
  const bareId = "bare-principal-database-schema-state";
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
    username: "bare-database-schema-state",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-database-schema-state", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("database schema-state route: reports the port's in-sync classification with both snapshots", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/schema-state`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as SchemaStateSummary;
  assert.equal(body.status, "in-sync");
  assert.deepEqual(body.siteMeta, { version: 0, tag: "memory" });
  assert.deepEqual(body.runtime, { version: 0, tag: "memory" });
});

test("database schema-state route: surfaces a DIVERGED lineage verbatim — the case that had no route at all", async (t) => {
  const { app } = buildTestApp(
    stubIntrospection({
      status: "diverged",
      siteMeta: { version: 7, tag: "0007_site_lineage" },
      runtime: { version: 7, tag: "0007_runtime_lineage" },
    }),
  );
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/schema-state`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as SchemaStateSummary;
  assert.equal(body.status, "diverged");
  assert.deepEqual(body.siteMeta, { version: 7, tag: "0007_site_lineage" });
  assert.deepEqual(body.runtime, { version: 7, tag: "0007_runtime_lineage" });
});

test("database schema-state route: passes through 'ahead' and 'behind' rather than collapsing them into one 'not in sync'", async (t) => {
  for (const status of ["ahead", "behind"] as const) {
    const { app } = buildTestApp(
      stubIntrospection({ status, siteMeta: { version: 9, tag: "shared" }, runtime: { version: 4, tag: "shared" } }),
    );
    const { baseUrl, cookie } = await bootAuthenticated(app, t);

    const res = await fetch(`${baseUrl}/api/admin/v1/database/schema-state`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as SchemaStateSummary;
    assert.equal(body.status, status);
  }
});

test("database schema-state route: reports 'unknown' with the null snapshot intact — never upgrades a partial pair into 'in-sync'", async (t) => {
  const { app } = buildTestApp(stubIntrospection({ status: "unknown", siteMeta: null, runtime: { version: 3, tag: "0003_x" } }));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/schema-state`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as SchemaStateSummary;
  assert.equal(body.status, "unknown");
  assert.equal(body.siteMeta, null);
  assert.deepEqual(body.runtime, { version: 3, tag: "0003_x" });
});

test("database schema-state route: a failing introspection read is a 500 carrying the real error text, not a fabricated clean status", async (t) => {
  const { app } = buildTestApp(stubIntrospection({ throws: new Error("content.db is locked") }));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/schema-state`, { headers: { cookie } });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; code: string; status?: string };
  assert.equal(body.error, "content.db is locked");
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.status, undefined);
});

test("database schema-state route: a caller with zero grants is rejected FORBIDDEN (database.read)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/schema-state`, { headers: { cookie: bareCookie } });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string; code: string; details: { permission: string } };
  assert.equal(
    body.error,
    "principal 'bare-principal-database-schema-state' is not authorized for 'database.read' (no_grant)",
  );
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "database.read");
});

test("database schema-state route: an unauthenticated caller never reaches the handler at all", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/database/schema-state`);
  assert.equal(res.status, 401);
});
