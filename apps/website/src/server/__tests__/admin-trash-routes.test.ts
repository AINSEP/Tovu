import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type Database from "better-sqlite3";

import {
  buildTrashRegistry,
  createContentDbTransactionRunner,
  createPostTrashAdapter,
  createRedirectTrashAdapter,
  createSqliteTrashDb,
  createTableTrashAdapter,
  createTrashService,
  POST_ENTITY_TYPE,
  REDIRECT_ENTITY_TYPE,
  SqliteTrashRepo,
  type TrashAdapter,
  type TrashPort,
} from "#src/features/trash/index";
import * as schema from "#src/platform/db/schema";
import { openContentDb } from "#src/platform/db/sqlite/content-db";

import { bootAuthenticated, loginAsBarePrincipal, startTestServer } from "./helpers/http-test-server.js";
import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { createTrashModule } from "../runtime/composition/modules/trash.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import type { TrashRouteDeps } from "../inbound/admin-http/routes/trash/deps.js";
import type { RouteDeps } from "../routes/types.js";

/**
 * @file Route-level tests for the local admin Trash HTTP surface (list / restore / purge). Design
 * of record: `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`.
 *
 * Two harnesses, because the two things being proved need different apps:
 *
 *  1. **The sink audit** boots the REAL `createApp()`. The dominant defect in this codebase is a
 *     correct primitive with an unwired call site, and these three routes spent a commit in exactly
 *     that state — written, compiling, registered nowhere. A route that is never mounted
 *     type-checks perfectly, so the only honest proof is a request that gets an answer. The
 *     assertions are on the response BODIES, not just the status: the site catch-all answers
 *     unknown paths too, and a 200 alone would not tell the two apart.
 *  2. **The permission tests** run against real SQLite trash rows, because the hermetic
 *     composition's record-store adapters deliberately have no `hardDelete` — purge stands down
 *     there, so `"purged"` is unobservable. They still register through `createTrashModule`, never
 *     through the registrars directly, so the module stays on the exercised path.
 *
 * The escalation case uses Redirects (`admin.redirects.manage`) as the permitted kind rather than
 * Comments: the comments table is plugin-namespaced (`p_<plugin>__comments`) and is not present in
 * a bare `openContentDb(":memory:")`. The shape being proved is per-kind, not per-domain — a
 * principal holding one kind's permission must not destroy another kind's row by naming its id.
 */

const WS_MISMATCH = "some-other-workspace";
const AT = "2026-09-20T12:00:00.000Z";

// ---------------------------------------------------------------------------
// 1. The sink audit — the real app

test("createApp() actually mounts all four trash routes, including the generic move-to-trash one", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const root = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/trash`;

  const listRes = await fetch(root, { headers: { cookie } });
  assert.equal(listRes.status, 200);
  assert.deepEqual(await listRes.json(), { items: [], nextCursor: null });

  const restoreRes = await fetch(`${root}/restore`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ items: [{ entityType: POST_ENTITY_TYPE, entityId: "no-such-post" }] }),
  });
  assert.equal(restoreRes.status, 200);
  assert.deepEqual(await restoreRes.json(), {
    restored: 0,
    results: [{ entityType: POST_ENTITY_TYPE, entityId: "no-such-post", outcome: "not-found" }],
  });

  const purgeRes = await fetch(`${root}/purge`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ ids: ["no-such-row"] }),
  });
  assert.equal(purgeRes.status, 200);
  assert.deepEqual(await purgeRes.json(), {
    purged: 0,
    results: [{ id: "no-such-row", outcome: "not-found" }],
  });

  // This hermetic composition registers only term/taxonomy generic entries, so `form` remains
  // unknown here. Its not-found/forbidden/success outcomes are proven below against real SQLite.
  const itemsUnknownRes = await fetch(`${root}/items`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "form", id: "no-such-form" }),
  });
  assert.equal(itemsUnknownRes.status, 404);
  assert.equal((await itemsUnknownRes.json() as { code: string }).code, "TRASH_UNKNOWN_TYPE");
});

test("createApp() moves a term through the generic trash items route", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  assert.equal(taxRes.status, 201, await taxRes.clone().text());
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };
  const termRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Generic Trash" }),
  });
  assert.equal(termRes.status, 201, await termRes.clone().text());
  const term = (await termRes.json()) as { term: { id: string } };

  const trashRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/trash/items`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "term", id: term.term.id }),
  });
  assert.equal(trashRes.status, 200, await trashRes.clone().text());
  assert.deepEqual(await trashRes.json(), { ok: true, version: 2 });
});

test("the trash routes answer 404 for a workspace that is not this site's", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const root = `${baseUrl}/api/admin/v1/workspaces/${WS_MISMATCH}/trash`;

  for (const res of [
    await fetch(root, { headers: { cookie } }),
    await fetch(`${root}/restore`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ items: [{ entityType: POST_ENTITY_TYPE, entityId: "x" }] }),
    }),
    await fetch(`${root}/purge`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ ids: ["x"] }),
    }),
    await fetch(`${root}/items`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ type: "form", id: "x" }),
    }),
  ]) {
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "workspace was not found" });
  }
});

// ---------------------------------------------------------------------------
// 2. Permissions, against real SQLite rows

interface TrashHarness {
  app: express.Express;
  deps: RouteDeps;
  client: Database.Database;
  trash: TrashPort;
}

/**
 * A real identity stack (so `authorize()` is the product's own) over a real SQLite trash service
 * (so a purge is a real row deletion), wired through `createTrashModule`.
 *
 * @complexity O(1) — one in-memory content DB and one express app per call.
 */
function buildTrashHarness(): TrashHarness {
  const base: RouteDeps = { ...createRouteDeps() };
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(base.workspaceId, "ws", "ws", "2026-01-01T00:00:00.000Z");

  const registry = buildTrashRegistry({ schema });
  const sqliteTrashDb = createSqliteTrashDb({ db });
  const adapters = new Map<string, TrashAdapter>([
    [POST_ENTITY_TYPE, createPostTrashAdapter(client)],
    [REDIRECT_ENTITY_TYPE, createRedirectTrashAdapter(client)],
    // `moveToTrash` (`POST .../trash/items`) is exercised through the `form` entry — the one
    // registry-derived kind G1c registers.
    ...[...registry.values()].map(
      (entry) => [entry.entityType, createTableTrashAdapter({ entry, db: sqliteTrashDb })] as const
    ),
  ]);
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

  return { app, deps: base, client, trash };
}

let grantCounter = 0;

/**
 * Registers a principal holding ONLY the named permissions — no role, no wildcard — and logs in.
 *
 * @returns the session cookie.
 * @complexity O(p) identity writes for p permissions.
 */
async function loginWithPermissions(
  deps: RouteDeps,
  baseUrl: string,
  permissions: readonly string[]
): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-trash-${suffix}`;
  const policyId = `grant-policy-trash-${suffix}`;
  const username = `grant-trash-${suffix}`;

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
  await deps.policyRepo.save({
    id: policyId,
    workspaceId: deps.workspaceId,
    name: `grant-policy-trash-${suffix}`,
    isBuiltin: false,
    isFrozen: false,
  });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({
      id: `grant-pp-trash-${suffix}-${permission}`,
      workspaceId: deps.workspaceId,
      policyId,
      permission,
      resourceType: null,
      constraintJson: null,
    });
  }
  await deps.principalPolicyRepo.save({
    id: `grant-link-trash-${suffix}`,
    workspaceId: deps.workspaceId,
    principalId,
    policyId,
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "grant-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/** @complexity O(1). */
function seedPost(client: Database.Database, workspaceId: string, id: string): void {
  client
    .prepare(
      `INSERT INTO posts (id, workspace_id, slug, title, status, body_json, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, 'published', '{"type":"doc"}', ?, ?, 1)`
    )
    .run(id, workspaceId, `slug-${id}`, `Title ${id}`, AT, AT);
}

/** @complexity O(1). */
function seedForm(client: Database.Database, workspaceId: string, id: string): void {
  client
    .prepare(
      `INSERT INTO form_definitions
         (id, workspace_id, name, slug, fields_json, notify_json, status, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, '{"fields":[]}', '{"enabled":false,"recipients":[]}', 'active', ?, ?, NULL, 1)`
    )
    .run(id, workspaceId, `Form ${id}`, `slug-${id}`, AT, AT);
}

/** @complexity O(1). */
function seedRedirect(client: Database.Database, workspaceId: string, id: string): void {
  client
    .prepare(
      `INSERT INTO redirects (id, workspace_id, match_type, from_pattern, to_target, status_code, status, override,
                              priority, source, created_by_principal, created_at, updated_at, version)
       VALUES (?, ?, 'exact', ?, '/to', 301, 'active', 0, 0, 'manual', 'principal-1', ?, ?, 1)`
    )
    .run(id, workspaceId, `/from-${id}`, AT, AT);
}

/** Puts one post and one redirect into the Trash and returns their trash row ids. */
async function trashOneOfEach(h: TrashHarness): Promise<{ postRow: string; redirectRow: string }> {
  seedPost(h.client, h.deps.workspaceId, "post-1");
  seedRedirect(h.client, h.deps.workspaceId, "redirect-1");
  for (const [entityType, entityId] of [
    [POST_ENTITY_TYPE, "post-1"],
    [REDIRECT_ENTITY_TYPE, "redirect-1"],
  ] as const) {
    const marker = await h.trash.trash({
      workspaceId: h.deps.workspaceId,
      entityType,
      entityId,
      actor: { principalId: "seed" },
      display: { title: entityId },
      at: AT,
      expectedVersion: 1,
    });
    assert.equal(marker.ok, true, `seeding ${entityType} into the trash`);
  }
  const page = await h.trash.list({ workspaceId: h.deps.workspaceId, now: AT, limit: 10 });
  const postRow = page.items.find((item) => item.entityType === POST_ENTITY_TYPE)?.id;
  const redirectRow = page.items.find((item) => item.entityType === REDIRECT_ENTITY_TYPE)?.id;
  assert.ok(postRow && redirectRow);
  return { postRow, redirectRow };
}

test("purge: a principal holding only one kind's permission cannot destroy another kind by naming its row id", async (t) => {
  const h = buildTrashHarness();
  const { postRow, redirectRow } = await trashOneOfEach(h);
  const baseUrl = await startTestServer(h.app, t);
  const cookie = await loginWithPermissions(h.deps, baseUrl, ["content.read", "admin.redirects.manage"]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${h.deps.workspaceId}/trash/purge`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ ids: [postRow, redirectRow] }),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    purged: 1,
    results: [
      { id: postRow, outcome: "forbidden" },
      { id: redirectRow, outcome: "purged" },
    ],
  });
  assert.notEqual(
    h.client.prepare(`SELECT id FROM posts WHERE id = ?`).get("post-1"),
    undefined,
    "the post the caller had no permission for is still on disk"
  );
  assert.equal(h.client.prepare(`SELECT id FROM redirects WHERE id = ?`).get("redirect-1"), undefined);
  const left = await h.trash.list({ workspaceId: h.deps.workspaceId, now: AT, limit: 10 });
  assert.deepEqual(
    left.items.map((item) => item.entityType),
    [POST_ENTITY_TYPE],
    "the forbidden row keeps its place in the Trash, so it is not stranded"
  );
});

test("list: rows are filtered by the permission each row's own kind needs", async (t) => {
  const h = buildTrashHarness();
  await trashOneOfEach(h);
  const baseUrl = await startTestServer(h.app, t);
  const cookie = await loginWithPermissions(h.deps, baseUrl, ["content.read", "admin.redirects.manage"]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${h.deps.workspaceId}/trash`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: { entityType: string; title: string; daysRemaining: number }[] };
  assert.deepEqual(
    body.items.map((item) => item.entityType),
    [REDIRECT_ENTITY_TYPE],
    "content.read alone must not leak the titles of four domains' deleted rows"
  );
  assert.equal(body.items[0]?.title, "redirect-1");
  assert.equal(typeof body.items[0]?.daysRemaining, "number");
});

test("list: resolves the deleting principal to a username, and falls back to a readable label when there is none", async (t) => {
  const h = buildTrashHarness();
  await h.deps.identityReady;

  // A real user account — this is the row the fix must resolve to a username instead of the raw id.
  const deleterPrincipalId = "deleter-principal-1";
  await h.deps.principalRepo.save({
    id: deleterPrincipalId,
    workspaceId: h.deps.workspaceId,
    kind: "user",
    displayName: "Row Deleter",
    status: "active",
    createdAt: h.deps.clock.nowIso(),
  });
  await h.deps.userRepo.save({
    principalId: deleterPrincipalId,
    workspaceId: h.deps.workspaceId,
    username: "row-deleter",
    passwordHash: await h.deps.passwordHasher.hash("irrelevant-pw"),
  });

  seedRedirect(h.client, h.deps.workspaceId, "redirect-known");
  seedRedirect(h.client, h.deps.workspaceId, "redirect-ghost");
  for (const [entityId, actorPrincipalId] of [
    ["redirect-known", deleterPrincipalId],
    // No principal or user row exists for this id — an account removed after the fact, or a
    // non-user system actor. The endpoint must not fall back to sending the raw id as the answer.
    ["redirect-ghost", "principal-with-no-user-row"],
  ] as const) {
    const marker = await h.trash.trash({
      workspaceId: h.deps.workspaceId,
      entityType: REDIRECT_ENTITY_TYPE,
      entityId,
      actor: { principalId: actorPrincipalId },
      display: { title: entityId },
      at: AT,
      expectedVersion: 1,
    });
    assert.equal(marker.ok, true, `seeding ${entityId} into the trash`);
  }

  const baseUrl = await startTestServer(h.app, t);
  const cookie = await loginWithPermissions(h.deps, baseUrl, ["content.read", "admin.redirects.manage"]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${h.deps.workspaceId}/trash`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body2 = (await res.json()) as {
    items: { entityId: string; actorPrincipalId: string; actorUsername: string | null }[];
  };
  const known = body2.items.find((item) => item.entityId === "redirect-known");
  const ghost = body2.items.find((item) => item.entityId === "redirect-ghost");
  assert.equal(known?.actorPrincipalId, deleterPrincipalId);
  assert.equal(known?.actorUsername, "row-deleter");
  assert.equal(ghost?.actorUsername, null);
});

/**
 * Regression guard for the 2026-09-21 "Deleted user" report: the owner's OWN account must resolve
 * to a username here too, not just other operators'. `loadUsernamesByPrincipalId` reads
 * `userRepo.list({ workspaceId })`, and this product seeds exactly one workspace with the owner
 * account inside it (`identity/wiring.ts`'s `ownerPrincipalId`), so there is no membership boundary
 * that could exclude the owner from that list — this test proves that rather than assuming it.
 */
test("list: resolves the seeded owner/admin account's own deletions to its username, not a fallback", async (t) => {
  const h = buildTrashHarness();
  await h.deps.identityReady;

  const ownerPrincipalId = await h.deps.ownerPrincipalId;
  const owner = await h.deps.userRepo.findByPrincipalId({ workspaceId: h.deps.workspaceId, principalId: ownerPrincipalId });
  assert.ok(owner, "the seeded owner account must have a user record");

  seedRedirect(h.client, h.deps.workspaceId, "redirect-by-owner");
  const marker = await h.trash.trash({
    workspaceId: h.deps.workspaceId,
    entityType: REDIRECT_ENTITY_TYPE,
    entityId: "redirect-by-owner",
    actor: { principalId: ownerPrincipalId },
    display: { title: "redirect-by-owner" },
    at: AT,
    expectedVersion: 1,
  });
  assert.equal(marker.ok, true, "seeding redirect-by-owner into the trash");

  const baseUrl = await startTestServer(h.app, t);
  const cookie = await loginWithPermissions(h.deps, baseUrl, ["content.read", "admin.redirects.manage"]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${h.deps.workspaceId}/trash`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body3 = (await res.json()) as { items: { entityId: string; actorUsername: string | null }[] };
  const row = body3.items.find((item) => item.entityId === "redirect-by-owner");
  assert.equal(row?.actorUsername, owner!.username);
});

test("list: pins actorIsSystem true for the system actor's own row and false for a human's row", async (t) => {
  const h = buildTrashHarness();
  await h.deps.identityReady;

  seedRedirect(h.client, h.deps.workspaceId, "redirect-by-system");
  seedRedirect(h.client, h.deps.workspaceId, "redirect-by-human");

  const ownerPrincipalId = await h.deps.ownerPrincipalId;
  for (const [entityId, actorPrincipalId] of [
    // "system" is the boot-time widget adoption's actor id (`write-service.ts`'s `ADOPTION_ACTOR`)
    // — no principal or user row exists for it, by design.
    ["redirect-by-system", "system"],
    ["redirect-by-human", ownerPrincipalId],
  ] as const) {
    const marker = await h.trash.trash({
      workspaceId: h.deps.workspaceId,
      entityType: REDIRECT_ENTITY_TYPE,
      entityId,
      actor: { principalId: actorPrincipalId },
      display: { title: entityId },
      at: AT,
      expectedVersion: 1,
    });
    assert.equal(marker.ok, true, `seeding ${entityId} into the trash`);
  }

  const baseUrl = await startTestServer(h.app, t);
  const cookie = await loginWithPermissions(h.deps, baseUrl, ["content.read", "admin.redirects.manage"]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${h.deps.workspaceId}/trash`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body4 = (await res.json()) as { items: { entityId: string; actorIsSystem: boolean }[] };
  const system = body4.items.find((item) => item.entityId === "redirect-by-system");
  const human = body4.items.find((item) => item.entityId === "redirect-by-human");
  assert.equal(system?.actorIsSystem, true, "the system actor's own row must be pinned actorIsSystem:true");
  assert.equal(human?.actorIsSystem, false, "a real account's row must not be misreported as the system actor");
});

test("restore: one forbidden item in a mixed selection does not abort the rest", async (t) => {
  const h = buildTrashHarness();
  await trashOneOfEach(h);
  const baseUrl = await startTestServer(h.app, t);
  const cookie = await loginWithPermissions(h.deps, baseUrl, ["content.read", "admin.redirects.manage"]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${h.deps.workspaceId}/trash/restore`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      items: [
        { entityType: POST_ENTITY_TYPE, entityId: "post-1" },
        { entityType: REDIRECT_ENTITY_TYPE, entityId: "redirect-1" },
      ],
    }),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    restored: 1,
    results: [
      { entityType: POST_ENTITY_TYPE, entityId: "post-1", outcome: "forbidden" },
      { entityType: REDIRECT_ENTITY_TYPE, entityId: "redirect-1", outcome: "restored" },
    ],
  });
  assert.equal(
    (h.client.prepare(`SELECT status FROM redirects WHERE id = ?`).get("redirect-1") as { status: string }).status,
    "active"
  );
});

test("items: forbidden without the kind's own permission; 200 with it; a second call reads not-found (already trashed)", async (t) => {
  const h = buildTrashHarness();
  seedForm(h.client, h.deps.workspaceId, "form-1");
  const baseUrl = await startTestServer(h.app, t);
  const root = `${baseUrl}/api/admin/v1/workspaces/${h.deps.workspaceId}/trash/items`;

  const forbiddenCookie = await loginWithPermissions(h.deps, baseUrl, ["content.read"]);
  const forbiddenRes = await fetch(root, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: forbiddenCookie },
    body: JSON.stringify({ type: "form", id: "form-1" }),
  });
  assert.equal(forbiddenRes.status, 403);
  const forbiddenBody = (await forbiddenRes.json()) as { code: string; details: { permission: string } };
  assert.equal(forbiddenBody.code, "FORBIDDEN");
  assert.equal(forbiddenBody.details.permission, "admin.forms.manage");
  assert.equal(
    (h.client.prepare(`SELECT deleted_at FROM form_definitions WHERE id = ?`).get("form-1") as { deleted_at: string | null }).deleted_at,
    null,
    "a forbidden call must never trash the row"
  );

  const okCookie = await loginWithPermissions(h.deps, baseUrl, ["admin.forms.manage"]);
  const okRes = await fetch(root, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: okCookie },
    body: JSON.stringify({ type: "form", id: "form-1" }),
  });
  assert.equal(okRes.status, 200);
  assert.deepEqual(await okRes.json(), { ok: true, version: 2 });
  assert.notEqual(
    (h.client.prepare(`SELECT deleted_at FROM form_definitions WHERE id = ?`).get("form-1") as { deleted_at: string | null }).deleted_at,
    null
  );

  // Already trashed by the call above -> reads as not-found, per `moveToTrash`'s own contract.
  const againRes = await fetch(root, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: okCookie },
    body: JSON.stringify({ type: "form", id: "form-1" }),
  });
  assert.equal(againRes.status, 404);
  assert.equal(((await againRes.json()) as { code: string }).code, "NOT_FOUND");
});

test("every trash route names the permission it wanted when the session holds no grants at all", async (t) => {
  const h = buildTrashHarness();
  const baseUrl = await startTestServer(h.app, t);
  const cookie = await loginAsBarePrincipal(h.deps, baseUrl);
  const root = `${baseUrl}/api/admin/v1/workspaces/${h.deps.workspaceId}/trash`;

  for (const res of [
    await fetch(root, { headers: { cookie } }),
    await fetch(`${root}/restore`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ items: [{ entityType: POST_ENTITY_TYPE, entityId: "post-1" }] }),
    }),
    await fetch(`${root}/purge`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ ids: ["trash-1"] }),
    }),
  ]) {
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code: string; details: { permission: string } };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.details.permission, "content.read");
  }
});

test("purge and restore refuse a selection that is not a usable one", async (t) => {
  const h = buildTrashHarness();
  const baseUrl = await startTestServer(h.app, t);
  const cookie = await loginWithPermissions(h.deps, baseUrl, ["content.read"]);
  const root = `${baseUrl}/api/admin/v1/workspaces/${h.deps.workspaceId}/trash`;

  for (const [path, body] of [
    [`${root}/purge`, { ids: [] }],
    [`${root}/purge`, { ids: [""] }],
    [`${root}/purge`, { ids: [{ id: "x" }] }],
    [`${root}/restore`, { items: [] }],
    [`${root}/restore`, { items: [{ entityType: POST_ENTITY_TYPE }] }],
  ] as const) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 400, `${path} ${JSON.stringify(body)}`);
    assert.equal(((await res.json()) as { code: string }).code, "INVALID_INPUT");
  }
});
