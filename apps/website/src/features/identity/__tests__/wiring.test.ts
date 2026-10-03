import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb, openContentDbReadOnly } from "#src/platform/db/sqlite/content-db";
// Side-effect import: registers the real BASE_CATALOG + the real permission-migration pairs
// (navigation.manage -> admin.menus.*, integration.manage -> admin.integrations.manage) before
// the tests below run. Reaches the barrel rather than `permissions.ts` directly because the
// package does not publish that module as its own subpath; loading the barrel loads it.
import { type IdentityRepos } from "@jini-ai/user-management";
// Side-effect import, same shape as the line above and for the same reason: loading the Pages
// barrel is what registers this repo's OWN permission-migration pair (theme.edit ->
// pages.edit_html, `features/pages/permissions.ts`). Registered by a host rather than by the
// library, which is the seam `registerPermissionMigration` is exported for.
import { PAGES_EDIT_HTML_PERMISSION } from "#src/features/pages/index";
import { createInMemoryIdentityRouteDeps, createSqliteIdentityRouteDeps, type IdentityRouteDepsSlice } from "../wiring.js";

const WORKSPACE = "workspace-1";
const fixedClock = { nowIso: () => "2026-07-14T00:00:00.000Z", nowMs: () => Date.parse("2026-07-14T00:00:00.000Z") };

// REGRESSION: fails if the in-memory wiring returns raw repositories without its shared transaction port.
test("identity wiring rolls back a failed unit and serializes an ordinary writer behind it", async () => {
  const deps = createInMemoryIdentityRouteDeps({ workspaceId: WORKSPACE, clock: fixedClock, idGen: counterIdGen() });
  await deps.identityReady;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const row = { id: "rollback-role", workspaceId: WORKSPACE, name: "temporary", isBuiltin: false };
  const failed = deps.transactions.run({ workspaceId: WORKSPACE, execute: async () => {
    await deps.roleRepo.save(row);
    entered();
    await hold;
    throw new Error("rollback probe");
  } });
  const rejected = assert.rejects(failed, /rollback probe/);
  await ready;
  let writerFinished = false;
  const writer = deps.roleRepo.save({ ...row, id: "committed-role" }).then(() => { writerFinished = true; });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(writerFinished, false, "an ordinary save cannot bypass the active transaction");
  } finally {
    release();
  }
  await rejected;
  await writer;
  assert.equal(await deps.roleRepo.findById({ workspaceId: WORKSPACE, id: row.id }), null);
  assert.equal((await deps.roleRepo.findById({ workspaceId: WORKSPACE, id: "committed-role" }))?.name, row.name);
});

// REGRESSION: fails if seed input appends ownerUsername: "admin" after reading TOVU_ADMIN_USER.
test("identity wiring preserves the host's configured owner username", async () => {
  const previous = process.env.TOVU_ADMIN_USER;
  process.env.TOVU_ADMIN_USER = "Configured-Owner";
  try {
    const deps = createInMemoryIdentityRouteDeps({ workspaceId: WORKSPACE, clock: fixedClock, idGen: counterIdGen() });
    await deps.identityReady;
    const owner = await deps.userRepo.findByPrincipalId({ workspaceId: WORKSPACE, principalId: await deps.ownerPrincipalId });
    assert.equal(owner?.username, "configured-owner");
  } finally {
    if (previous === undefined) delete process.env.TOVU_ADMIN_USER;
    else process.env.TOVU_ADMIN_USER = previous;
  }
});

function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

test("createInMemoryIdentityRouteDeps: identityReady also runs migrateDeprecatedPermissionGrants against real registered pairs (ADR-PIPE-012 T013)", async () => {
  const deps = createInMemoryIdentityRouteDeps({
    workspaceId: WORKSPACE,
    clock: fixedClock,
    idGen: counterIdGen(),
  });

  // Simulates a pre-existing policy holding both deprecated flat strings, seeded directly
  // against the same repos this wiring exposes — before identityReady resolves.
  await deps.policyRepo.save({
    id: "policy-legacy",
    workspaceId: WORKSPACE,
    name: "legacy-policy",
    isBuiltin: false,
    isFrozen: false,
  });
  await deps.policyPermissionRepo.save({
    id: "grant-legacy-navigation",
    workspaceId: WORKSPACE,
    policyId: "policy-legacy",
    permission: "navigation.manage",
  });
  await deps.policyPermissionRepo.save({
    id: "grant-legacy-integration",
    workspaceId: WORKSPACE,
    policyId: "policy-legacy",
    permission: "integration.manage",
  });

  await deps.identityReady;

  const grants = await deps.policyPermissionRepo.listByPolicyId({
    workspaceId: WORKSPACE,
    policyId: "policy-legacy",
  });
  const permissions = grants.map((g) => g.permission);

  assert.ok(permissions.includes("navigation.manage"), "old grant never removed");
  assert.ok(permissions.includes("integration.manage"), "old grant never removed");
  assert.ok(permissions.includes("admin.integrations.manage"), "Integrations migration ran");
  for (const menusPermission of [
    "admin.menus.read",
    "admin.menus.create",
    "admin.menus.update",
    "admin.menus.delete",
    "admin.menus.delete.force",
    "admin.menus.assign",
  ]) {
    assert.ok(permissions.includes(menusPermission), `Menus migration granted ${menusPermission}`);
  }
});

/**
 * `buildIdentityRouteDeps`'s own `authorize` closure -- the RBAC gate route handlers actually
 * call -- had never been invoked through the wiring layer itself; only `authorizeCore` in
 * isolation and the full HTTP-route path are covered elsewhere. This proves the closure threads
 * `principalId`/`permission`/`context` through to the SAME repos this wiring bound it to, for
 * both the allow and the fail-closed-deny outcome.
 */
test("createInMemoryIdentityRouteDeps: the wired authorize() closure grants the seeded owner's wildcard and fails closed for an unknown principal", async () => {
  const deps = createInMemoryIdentityRouteDeps({
    workspaceId: WORKSPACE,
    clock: fixedClock,
    idGen: counterIdGen(),
  });
  await deps.identityReady;
  const ownerPrincipalId = await deps.ownerPrincipalId;

  const ownerDecision = await deps.authorize({
    principalId: ownerPrincipalId,
    permission: "content.read",
    workspaceId: WORKSPACE,
  });
  assert.deepEqual(ownerDecision, { allowed: true, reason: "owner_wildcard" });

  const unknownDecision = await deps.authorize({
    principalId: "principal-does-not-exist",
    permission: "content.read",
    workspaceId: WORKSPACE,
  });
  assert.deepEqual(unknownDecision, { allowed: false, reason: "principal_disabled" });

  await deps.principalRepo.save({ id: "reader", workspaceId: WORKSPACE, kind: "user", displayName: "Reader", status: "active", createdAt: fixedClock.nowIso() });
  await deps.policyRepo.save({ id: "reader-policy", workspaceId: WORKSPACE, name: "reader-policy", isBuiltin: false, isFrozen: false });
  await deps.principalPolicyRepo.save({ id: "reader-assignment", workspaceId: WORKSPACE, principalId: "reader", policyId: "reader-policy" });
  await deps.policyPermissionRepo.save({ id: "reader-grant", workspaceId: WORKSPACE, policyId: "reader-policy", permission: "content.read", resourceType: "post" });

  const request = { principalId: "reader", workspaceId: WORKSPACE, entityType: "post", entityId: "post-1", permission: "content.read" };
  assert.deepEqual(await deps.authorize(request), { allowed: true, reason: "matched" });
  assert.deepEqual(await deps.authorize({ ...request, permission: "content.write" }), { allowed: false, reason: "no_grant" });
  assert.deepEqual(await deps.authorize({ ...request, entityType: "page" }), { allowed: false, reason: "resource_scope_mismatch" });
  assert.deepEqual(await deps.authorize({ ...request, workspaceId: "other-workspace" }), { allowed: false, reason: "principal_disabled" });

});

test("createInMemoryIdentityRouteDeps: identityReady resolves even with no pre-existing legacy grants (no-op case)", async () => {
  const deps = createInMemoryIdentityRouteDeps({
    workspaceId: "workspace-2",
    clock: fixedClock,
    idGen: counterIdGen(),
  });

  await assert.doesNotReject(() => deps.identityReady);
});

test("createSqliteIdentityRouteDeps: a session survives a simulated restart (fresh wiring call against the same content.db file)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-identity-wiring-test-"));
  const dbPath = join(dir, "content.db");
  try {
    const ws = "workspace-restart-test";

    // "First boot."
    const db1 = openContentDb(dbPath);
    const first = createSqliteIdentityRouteDeps({ db: db1, workspaceId: ws, clock: fixedClock, idGen: counterIdGen() });
    await first.identityReady;

    const ownerBefore = await first.userRepo.findByUsername({ workspaceId: ws, username: "admin" });
    assert.ok(ownerBefore, "owner user was seeded on first boot");

    await first.sessionRepo.save({
      id: "session-1",
      workspaceId: ws,
      principalId: ownerBefore!.principalId,
      tokenHash: "fixed-token-hash",
      createdAt: fixedClock.nowIso(),
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    // "Restart": a brand-new content.db handle + a brand-new createSqliteIdentityRouteDeps call
    // against the SAME on-disk file — this is exactly what `tsx watch` does to the real process.
    const db2 = openContentDb(dbPath);
    const second = createSqliteIdentityRouteDeps({ db: db2, workspaceId: ws, clock: fixedClock, idGen: counterIdGen() });
    await second.identityReady;

    const ownerAfter = await second.userRepo.findByUsername({ workspaceId: ws, username: "admin" });
    assert.equal(
      ownerAfter?.principalId,
      ownerBefore!.principalId,
      "seedIdentity's idempotency check reuses the SAME principal id across restarts, not a fresh random one"
    );

    const sessionAfter = await second.sessionRepo.findByTokenHash({ workspaceId: ws, tokenHash: "fixed-token-hash" });
    assert.ok(sessionAfter, "the session persisted across the simulated restart");
    assert.equal(
      sessionAfter?.principalId,
      ownerAfter?.principalId,
      "the persisted session still points at a real, current principal — not orphaned"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * SPEC-047 REQ-9, at the boot seam rather than in isolation.
 *
 * `features/pages/__tests__/edit-html-permission.test.ts` certifies the resulting privilege split
 * (admin yes, editor no) by calling `seedIdentity` / `migrateDeprecatedPermissionGrants` /
 * `authorize` itself. What it cannot certify is that THIS wiring — the thing production actually
 * boots — runs the fan-out over a pair registered by this repo rather than by `@jini-ai/cms`. That
 * is what fails silently if it ever breaks: the gate would still be evaluated, no row would ever be
 * granted, and every non-owner principal would be refused with `no_grant` — a fail-CLOSED lockout
 * that reads as "the Pages feature broke" rather than as a wiring regression.
 *
 * Ordering is not asserted here because it cannot go wrong: both gates
 * (`routes/pages/update-html.ts` and `features/pages/tool-registrations.ts`) read their permission
 * string FROM the module that performs the registration, so the gate is unreachable unless that
 * module has already been evaluated. The compiler enforces the edge; this test enforces the effect.
 */
test("createInMemoryIdentityRouteDeps: identityReady grants pages.edit_html to a policy holding theme.edit (SPEC-047 REQ-9, a host-registered pair)", async () => {
  const workspaceId = "workspace-pages-edit-html";
  const deps = createInMemoryIdentityRouteDeps({
    workspaceId,
    clock: fixedClock,
    idGen: counterIdGen(),
  });

  // Stands in for the built-in `admin` policy, which holds `theme.edit` and not `content.write`-only
  // — seeded directly against the same repos this wiring exposes, before identityReady resolves.
  await deps.policyRepo.save({
    id: "policy-theme-author",
    workspaceId,
    name: "theme-author-policy",
    isBuiltin: false,
    isFrozen: false,
  });
  await deps.policyPermissionRepo.save({
    id: "grant-theme-edit",
    workspaceId,
    policyId: "policy-theme-author",
    permission: "theme.edit",
  });

  // A policy shaped like the built-in `editor` role: ordinary content authoring, no theme source.
  await deps.policyRepo.save({
    id: "policy-content-author",
    workspaceId,
    name: "content-author-policy",
    isBuiltin: false,
    isFrozen: false,
  });
  await deps.policyPermissionRepo.save({
    id: "grant-content-write",
    workspaceId,
    policyId: "policy-content-author",
    permission: "content.write",
  });

  await deps.identityReady;

  const permissionsOf = async (policyId: string) =>
    (await deps.policyPermissionRepo.listByPolicyId({ workspaceId, policyId })).map((g) => g.permission);

  const themeAuthor = await permissionsOf("policy-theme-author");
  assert.ok(
    themeAuthor.includes(PAGES_EDIT_HTML_PERMISSION),
    "a principal already trusted with raw theme source inherits raw-page-HTML authoring"
  );
  assert.ok(themeAuthor.includes("theme.edit"), "the `from` grant is never removed — the fan-out is additive-only");

  const contentAuthor = await permissionsOf("policy-content-author");
  assert.ok(
    !contentAuthor.includes(PAGES_EDIT_HTML_PERMISSION),
    "content.write alone must NOT confer raw-page-HTML authoring — this is the whole point of REQ-9"
  );
  assert.ok(contentAuthor.includes("content.write"), "and ordinary content authoring is untouched");
});

/**
 * The boot seam for the SECOND grant path, run over a FRESHLY-seeded workspace.
 *
 * **This test does NOT, by itself, prove the backfill is load-bearing.** A fresh workspace's
 * `admin-builtin-policy` already holds `theme.edit` (it is on the current `BUILTIN_ADMIN_PERMISSIONS`
 * list), so `migrateDeprecatedPermissionGrants`' fan-out — already exercised by the sibling test above
 * — grants `pages.edit_html` to `admin-builtin-policy` on its own, with no help from
 * `applyBuiltinRoleGrants` at all. An earlier version of this comment claimed this test "fails if the
 * backfill is ever dropped from the boot chain"; that was false, and was never actually exercised —
 * deleting `applyBuiltinRoleGrants` from `identityReady`'s chain would leave this assertion GREEN.
 *
 * What this test DOES certify: `identityReady`'s composed chain still reaches admin and only admin,
 * end to end, in the vintage every fresh install boots into. The vintage where the backfill is the
 * ONLY path — `sites/tovu-com/content.db`'s own vintage, seeded before `theme.edit` joined
 * `BUILTIN_ADMIN_PERMISSIONS` — is certified separately below, where removing `applyBuiltinRoleGrants`
 * from the sequence provably turns this same assertion red.
 */
test("createInMemoryIdentityRouteDeps: identityReady grants pages.edit_html to the built-in admin policy and to no other built-in policy (SPEC-047 REQ-9)", async () => {
  const workspaceId = "workspace-builtin-role-grant";
  const deps = createInMemoryIdentityRouteDeps({
    workspaceId,
    clock: fixedClock,
    idGen: counterIdGen(),
  });

  // The seed this wiring kicks off is what creates the four built-in roles and their 1:1 policies.
  await deps.identityReady;

  const permissionsOfPolicyNamed = async (name: string) => {
    const policy = await deps.policyRepo.findByName({ workspaceId, name });
    assert.ok(policy, `seedIdentity must have created '${name}'`);
    return (await deps.policyPermissionRepo.listByPolicyId({ workspaceId, policyId: policy.id })).map(
      (row) => row.permission
    );
  };

  assert.ok(
    (await permissionsOfPolicyNamed("admin-builtin-policy")).includes(PAGES_EDIT_HTML_PERMISSION),
    "the built-in admin policy must hold pages.edit_html after boot"
  );

  // The refusals are the assertions that matter: a backfill that reached these would BE the
  // SPEC-047 REQ-9 vulnerability, not a wiring bug.
  for (const name of ["editor-builtin-policy", "viewer-builtin-policy"] as const) {
    assert.ok(
      !(await permissionsOfPolicyNamed(name)).includes(PAGES_EDIT_HTML_PERMISSION),
      `${name} must NOT gain raw-page-HTML authoring`
    );
  }

  // The owner policy holds only `*`; `authorize()` short-circuits on it, so a row here would mean
  // the backfill had started writing onto the wildcard policy.
  assert.deepEqual(
    await permissionsOfPolicyNamed("owner-builtin-policy"),
    ["*"],
    "the owner policy stays exactly its seeded wildcard"
  );
});

/**
 * Rewind the seeded `admin` policy to its pre-`theme.edit` vintage by removing that one row. Same
 * technique as `features/pages/__tests__/edit-html-permission.test.ts`'s `dropAdminThemeEdit` (the
 * anchor fix for this exact gap at a different sink, `db83fdaf`) — duplicated here rather than
 * imported, matching that file's own choice to keep each certification self-contained (see its
 * `dropAdminThemeEdit` comment).
 *
 * Asserts the row was there before removing it, deliberately: if `theme.edit` ever leaves
 * `BUILTIN_ADMIN_PERMISSIONS`, this fixture would otherwise silently stop simulating anything and
 * the pre-`theme.edit` case below would start passing for the wrong reason.
 */
async function dropAdminThemeEdit(repos: Pick<IdentityRepos, "policies" | "policyPermissions">, workspaceId: string): Promise<void> {
  const policy = await repos.policies.findByName({ workspaceId, name: "admin-builtin-policy" });
  assert.ok(policy, "seedIdentity must have created the built-in admin policy");

  const grants = await repos.policyPermissions.listByPolicyId({ workspaceId, policyId: policy.id });
  const themeEdit = grants.find((row) => row.permission === "theme.edit");
  assert.ok(themeEdit, "the current admin seed list must still contain theme.edit for this rewind to mean anything");

  await repos.policyPermissions.delete({ workspaceId, id: themeEdit.id });
}

/** Reopen a persisted pre-theme.edit workspace through production identityReady. */
test("createSqliteIdentityRouteDeps: identityReady grants pages.edit_html to admin in a pre-theme.edit workspace (SPEC-047 REQ-9)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-identity-wiring-legacy-test-"));
  const dbPath = join(dir, "content.db");
  const workspaceId = "workspace-pre-theme-edit-builtin-role-grant";
  const idGen = counterIdGen();
  const setupDb = openContentDb(dbPath);
  let bootDb: ReturnType<typeof openContentDb> | undefined;
  try {
    const setup = createSqliteIdentityRouteDeps({ db: setupDb, workspaceId, clock: fixedClock, idGen, reconcileGrantsOnBoot: false });
    await setup.identityReady;
    await dropAdminThemeEdit({ policies: setup.policyRepo, policyPermissions: setup.policyPermissionRepo }, workspaceId);
    const admin = await setup.policyRepo.findByName({ workspaceId, name: "admin-builtin-policy" });
    assert.ok(admin);
    const before = await setup.policyPermissionRepo.listByPolicyId({ workspaceId, policyId: admin.id });
    assert.ok(!before.some((row) => row.permission === "theme.edit" || row.permission === PAGES_EDIT_HTML_PERMISSION));
    setupDb.$client.close();

    bootDb = openContentDb(dbPath);
    const boot = createSqliteIdentityRouteDeps({ db: bootDb, workspaceId, clock: fixedClock, idGen });
    await boot.identityReady;
    const permissionsOfPolicyNamed = async (name: string) => {
      const policy = await boot.policyRepo.findByName({ workspaceId, name });
      assert.ok(policy, `seedIdentity must have created '${name}'`);
      return (await boot.policyPermissionRepo.listByPolicyId({ workspaceId, policyId: policy.id })).map((row) => row.permission);
    };
    const adminPermissions = await permissionsOfPolicyNamed("admin-builtin-policy");
    assert.ok(!adminPermissions.includes("theme.edit"), "the old workspace still has no fan-out anchor");
    assert.ok(adminPermissions.includes(PAGES_EDIT_HTML_PERMISSION), "the real boot backfill must reach deployed admins");
    for (const name of ["editor-builtin-policy", "viewer-builtin-policy"] as const) {
      assert.ok(!(await permissionsOfPolicyNamed(name)).includes(PAGES_EDIT_HTML_PERMISSION), `${name} must NOT gain raw-page-HTML authoring`);
    }
    assert.deepEqual(await permissionsOfPolicyNamed("owner-builtin-policy"), ["*"], "the owner policy stays exactly its seeded wildcard");
  } finally {
    if (setupDb.$client.open) setupDb.$client.close();
    bootDb?.$client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Two real boots over persistent storage must not double-write a grant. */
test("createSqliteIdentityRouteDeps: a second identityReady adds no duplicate pages.edit_html row", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-identity-wiring-idempotent-test-"));
  const dbPath = join(dir, "content.db");
  const workspaceId = "workspace-builtin-role-grant-idempotent";
  const idGen = counterIdGen();
  const firstDb = openContentDb(dbPath);
  let secondDb: ReturnType<typeof openContentDb> | undefined;
  try {
    const first = createSqliteIdentityRouteDeps({ db: firstDb, workspaceId, clock: fixedClock, idGen });
    await first.identityReady;
    const policy = await first.policyRepo.findByName({ workspaceId, name: "admin-builtin-policy" });
    assert.ok(policy);
    const before = await first.policyPermissionRepo.listByPolicyId({ workspaceId, policyId: policy.id });
    assert.equal(before.filter((row) => row.permission === PAGES_EDIT_HTML_PERMISSION).length, 1);
    firstDb.$client.close();

    secondDb = openContentDb(dbPath);
    const second = createSqliteIdentityRouteDeps({ db: secondDb, workspaceId, clock: fixedClock, idGen });
    await second.identityReady;
    const after = await second.policyPermissionRepo.listByPolicyId({ workspaceId, policyId: policy.id });
    assert.equal(after.filter((row) => row.permission === PAGES_EDIT_HTML_PERMISSION).length, 1, "re-running identityReady must not append a second grant row");
    assert.deepEqual(after, before, "the second boot preserves the exact grant rows");
  } finally {
    if (firstDb.$client.open) firstDb.$client.close();
    secondDb?.$client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * `reconcileGrantsOnBoot: false` — the escape hatch added for
 * `development/scripts/backfill-reset-admin-password.ts`'s dry-run path (see `wiring.ts`'s own
 * comment on this option). This proves the flag actually suppresses the fan-out, not just that a
 * fresh workspace happens to have nothing outstanding: the sibling test at line ~275 (same fresh
 * vintage, flag omitted) asserts admin DOES gain `pages.edit_html`; this one asserts it does not.
 */
test("createInMemoryIdentityRouteDeps: reconcileGrantsOnBoot: false skips the pages.edit_html backfill the default path performs", async () => {
  const workspaceId = "workspace-reconcile-flag-inmemory";
  const deps = createInMemoryIdentityRouteDeps({
    workspaceId,
    clock: fixedClock,
    idGen: counterIdGen(),
    reconcileGrantsOnBoot: false,
  });

  await deps.identityReady;

  const policy = await deps.policyRepo.findByName({ workspaceId, name: "admin-builtin-policy" });
  assert.ok(policy, "seedIdentity itself is unaffected by the flag — the built-in policy still exists");
  const permissions = (await deps.policyPermissionRepo.listByPolicyId({ workspaceId, policyId: policy.id })).map(
    (row) => row.permission
  );
  assert.ok(
    !permissions.includes(PAGES_EDIT_HTML_PERMISSION),
    "reconcileGrantsOnBoot: false must skip applyBuiltinRoleGrants entirely, not just no-op it"
  );
});

/** Removes the `pages.edit_html` row a default (`reconcileGrantsOnBoot` omitted) boot just granted
 *  onto `admin-builtin-policy`, so the fixture below can simulate "still outstanding" without a
 *  second, differently-shaped workspace vintage. Mirrors `dropAdminThemeEdit` above, adapted to the
 *  `IdentityRouteDepsSlice` field names (`policyRepo`/`policyPermissionRepo`) rather than
 *  `IdentityRepos`'s (`policies`/`policyPermissions`) since this fixture drives the public wiring
 *  constructors, not the repos directly. */
async function dropAdminPagesEditHtml(
  deps: Pick<IdentityRouteDepsSlice, "policyRepo" | "policyPermissionRepo">,
  workspaceId: string
): Promise<void> {
  const policy = await deps.policyRepo.findByName({ workspaceId, name: "admin-builtin-policy" });
  assert.ok(policy, "seedIdentity must have created the built-in admin policy");
  const grants = await deps.policyPermissionRepo.listByPolicyId({ workspaceId, policyId: policy.id });
  const row = grants.find((g) => g.permission === PAGES_EDIT_HTML_PERMISSION);
  assert.ok(row, "the default-reconcile boot just above must have granted pages.edit_html before this drops it");
  await deps.policyPermissionRepo.delete({ workspaceId, id: row.id });
}

/**
 * The concrete hazard `reconcileGrantsOnBoot` exists to prevent, proven against a REAL read-only
 * `better-sqlite3` connection rather than reasoned about: `applyBuiltinRoleGrants`'s `.save()` is
 * additive-only, but "additive-only" is a statement about which ROWS it touches, not about whether
 * it attempts to write at all — against a workspace with an outstanding grant, it always tries, and
 * a genuinely read-only connection throws on that attempt instead of no-op'ing.
 *
 * Two identity constructions run over the SAME on-disk file, already seeded and already missing
 * `pages.edit_html` (dropped below) so there is something for the fan-out to do: one opts out via
 * `reconcileGrantsOnBoot: false` and must resolve cleanly; the other omits the flag (today's
 * pre-existing default behavior) and must reject with the exact underlying SQLite error — proving
 * the flag is load-bearing, not incidentally unnecessary.
 */
test("createSqliteIdentityRouteDeps: reconcileGrantsOnBoot: false avoids the readonly-write crash a dry-run connection would otherwise hit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-identity-wiring-readonly-test-"));
  const dbPath = join(dir, "content.db");
  const workspaceId = "workspace-reconcile-flag-sqlite-readonly";
  try {
    const setupDb = openContentDb(dbPath);
    const setup = createSqliteIdentityRouteDeps({ db: setupDb, workspaceId, clock: fixedClock, idGen: counterIdGen() });
    await setup.identityReady;
    await dropAdminPagesEditHtml(setup, workspaceId);
    setupDb.$client.close();

    const roForFlagOff = openContentDbReadOnly(dbPath);
    const flagOff = createSqliteIdentityRouteDeps({
      db: roForFlagOff,
      workspaceId,
      clock: fixedClock,
      idGen: counterIdGen(),
      reconcileGrantsOnBoot: false,
    });
    await assert.doesNotReject(
      () => flagOff.identityReady,
      "reconcileGrantsOnBoot: false must never attempt the write, so a read-only connection is safe"
    );
    roForFlagOff.$client.close();

    const roForFlagDefault = openContentDbReadOnly(dbPath);
    const flagDefault = createSqliteIdentityRouteDeps({
      db: roForFlagDefault,
      workspaceId,
      clock: fixedClock,
      idGen: counterIdGen(),
    });
    await assert.rejects(
      () => flagDefault.identityReady,
      (err: unknown) => {
        assert.equal((err as Error).message, "attempt to write a readonly database");
        return true;
      },
      "omitting the flag against the identical outstanding grant must hit the real SQLite readonly error — proving flagOff's clean resolution above was the flag's doing, not the fixture's"
    );
    roForFlagDefault.$client.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
