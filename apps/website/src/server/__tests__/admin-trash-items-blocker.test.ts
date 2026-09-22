import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type Database from "better-sqlite3";

import {
  buildTrashRegistry,
  createContentDbTransactionRunner,
  createSqliteTrashDb,
  createTableTrashAdapter,
  createTrashService,
  SqliteTrashRepo,
  type TrashAdapter,
} from "#src/features/trash/index";
import * as schema from "#src/platform/db/schema";
import { openContentDb } from "#src/platform/db/sqlite/content-db";

import { startTestServer } from "./helpers/http-test-server.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { createTrashModule } from "../runtime/composition/modules/trash.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import type { TrashRouteDeps } from "../inbound/admin-http/routes/trash/deps.js";
import type { RouteDeps } from "../routes/types.js";

/**
 * @file `POST /trash/items` -> HTTP 409 for a `TrashEntry.blocker` hit (T1 plan item 2). Pins the
 * route-level outcome mapping `items.ts` adds for `moveToTrash`'s `"blocked"` reason, using `term`'s
 * real registry entry (`TERM_HAS_CHILDREN`) — the only registered blocker today.
 *
 * Harness mirrors `admin-trash-routes.test.ts`'s `buildTrashHarness`, generalized to register every
 * `TRASHABLE` entry through `createTableTrashAdapter` (not just post/redirect), since this file only
 * needs `term`/`taxonomy`.
 */

const AT = "2026-09-21T12:00:00.000Z";

interface Harness {
  app: express.Express;
  deps: RouteDeps;
  client: Database.Database;
}

function buildHarness(): Harness {
  const base: RouteDeps = { ...createRouteDeps() };
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(base.workspaceId, "ws", "ws", "2026-01-01T00:00:00.000Z");

  const registry = buildTrashRegistry({ schema });
  const sqliteTrashDb = createSqliteTrashDb({ db });
  const adapters = new Map<string, TrashAdapter>(
    [...registry.values()].map((entry) => [entry.entityType, createTableTrashAdapter({ entry, db: sqliteTrashDb })] as const)
  );
  let seq = 0;
  const trash = createTrashService({
    repo: new SqliteTrashRepo(client),
    adapters,
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction: createContentDbTransactionRunner(client),
  });

  const trashDeps: TrashRouteDeps = {
    workspaceId: base.workspaceId,
    authorize: base.authorize,
    clock: base.clock,
    trash,
    registry,
    db: sqliteTrashDb,
    userRepo: base.userRepo,
  };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, base);
  app.use("/api/admin", requireAdminSession(base));
  createTrashModule(trashDeps).registerRoutes?.(app);

  return { app, deps: base, client };
}

let grantCounter = 0;

/** Registers a principal holding ONLY the named permissions and logs in — same pattern
 *  `admin-trash-routes.test.ts`'s `loginWithPermissions` uses (local copy: not exported there). */
async function loginWithPermissions(deps: RouteDeps, baseUrl: string, permissions: readonly string[]): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-blocker-${suffix}`;
  const policyId = `grant-policy-blocker-${suffix}`;
  const username = `grant-blocker-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Grants: ${permissions.join(", ")}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash("grant-pw"),
  });
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: policyId, isBuiltin: false, isFrozen: false });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({
      id: `grant-pp-blocker-${suffix}-${permission}`,
      workspaceId: deps.workspaceId,
      policyId,
      permission,
      resourceType: null,
      constraintJson: null,
    });
  }
  await deps.principalPolicyRepo.save({ id: `grant-link-blocker-${suffix}`, workspaceId: deps.workspaceId, principalId, policyId });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "grant-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function seedTaxonomy(client: Database.Database, workspaceId: string, id: string): void {
  client
    .prepare(`INSERT INTO taxonomies (id, workspace_id, name, hierarchical, status, updated_at, version) VALUES (?, ?, ?, 1, 'active', ?, 1)`)
    .run(id, workspaceId, `Taxonomy ${id}`, AT);
}

function seedTerm(client: Database.Database, workspaceId: string, id: string, taxonomyId: string, parentId: string | null): void {
  client
    .prepare(
      `INSERT INTO terms (id, workspace_id, taxonomy_id, parent_id, name, status, updated_at, version) VALUES (?, ?, ?, ?, ?, 'active', ?, 1)`
    )
    .run(id, workspaceId, taxonomyId, parentId, `Term ${id}`, AT);
}

test("POST /trash/items on a term with a child answers 409 TERM_HAS_CHILDREN with the child count, and leaves the row live", async (t) => {
  const h = buildHarness();
  seedTaxonomy(h.client, h.deps.workspaceId, "tax-1");
  seedTerm(h.client, h.deps.workspaceId, "term-parent", "tax-1", null);
  seedTerm(h.client, h.deps.workspaceId, "term-child", "tax-1", "term-parent");

  const baseUrl = await startTestServer(h.app, t);
  const root = `${baseUrl}/api/admin/v1/workspaces/${h.deps.workspaceId}/trash/items`;
  const cookie = await loginWithPermissions(h.deps, baseUrl, ["admin.taxonomy.manage"]);

  const res = await fetch(root, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "term", id: "term-parent" }),
    signal: AbortSignal.timeout(5000),
  });

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), {
    error: "this term has 1 sub-terms — move them under another parent, or delete them permanently, first",
    code: "TERM_HAS_CHILDREN",
    count: 1,
  });
  const row = h.client.prepare(`SELECT status FROM terms WHERE id = 'term-parent'`).get() as { status: string };
  assert.equal(row.status, "active", "a blocked hide must never write the marker");
});

test("POST /trash/items on a childless term still answers 200 (the blocker check does not block the unblocked case)", async (t) => {
  const h = buildHarness();
  seedTaxonomy(h.client, h.deps.workspaceId, "tax-1");
  seedTerm(h.client, h.deps.workspaceId, "term-leaf", "tax-1", null);

  const baseUrl = await startTestServer(h.app, t);
  const root = `${baseUrl}/api/admin/v1/workspaces/${h.deps.workspaceId}/trash/items`;
  const cookie = await loginWithPermissions(h.deps, baseUrl, ["admin.taxonomy.manage"]);

  const res = await fetch(root, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "term", id: "term-leaf" }),
    signal: AbortSignal.timeout(5000),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, version: 2 });
});
