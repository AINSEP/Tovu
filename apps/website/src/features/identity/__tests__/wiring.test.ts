import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
// Side-effect import: registers the real BASE_CATALOG + the real permission-migration pairs
// (navigation.manage -> admin.menus.*, integration.manage -> admin.integrations.manage) before
// the tests below run. Reaches the barrel rather than `permissions.ts` directly because the
// package does not publish that module as its own subpath; loading the barrel loads it.
import {
  type IdentityRepos,
  InMemoryPolicyPermissionRepo,
  InMemoryPolicyRepo,
  InMemoryPrincipalPolicyRepo,
  InMemoryPrincipalRepo,
  InMemoryPrincipalRoleRepo,
  InMemoryRolePolicyRepo,
  InMemoryRoleRepo,
  InMemorySessionRepo,
  InMemoryUserRepo,
  migrateDeprecatedPermissionGrants,
  seedIdentity,
} from "@jini-ai/cms/identity";
// Side-effect import, same shape as the line above and for the same reason: loading the Pages
// barrel is what registers this repo's OWN permission-migration pair (theme.edit ->
// pages.edit_html, `features/pages/permissions.ts`). Registered by a host rather than by the
// library, which is the seam `registerPermissionMigration` is exported for.
import { PAGES_EDIT_HTML_PERMISSION } from "#src/features/pages/index";
import { applyBuiltinRoleGrants } from "../builtin-role-grants.js";
import { createInMemoryIdentityRouteDeps, createSqliteIdentityRouteDeps } from "../wiring.js";

const WORKSPACE = "workspace-1";
const fixedClock = { nowIso: () => "2026-07-14T00:00:00.000Z" };

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
async function dropAdminThemeEdit(repos: IdentityRepos, workspaceId: string): Promise<void> {
  const policy = await repos.policies.findByName({ workspaceId, name: "admin-builtin-policy" });
  assert.ok(policy, "seedIdentity must have created the built-in admin policy");

  const grants = await repos.policyPermissions.listByPolicyId({ workspaceId, policyId: policy.id });
  const themeEdit = grants.find((row) => row.permission === "theme.edit");
  assert.ok(themeEdit, "the current admin seed list must still contain theme.edit for this rewind to mean anything");

  await repos.policyPermissions.delete({ workspaceId, id: themeEdit.id });
}

/**
 * The vintage that actually ships, at the boot seam. `sites/tovu-com/content.db`'s own
 * `admin-builtin-policy` has no `theme.edit` row — seeded before that permission joined
 * `BUILTIN_ADMIN_PERMISSIONS`, and unable to gain it because `seedIdentity` early-returns once an
 * owner user exists — so `migrateDeprecatedPermissionGrants`' fan-out matches nothing there.
 * `applyBuiltinRoleGrants` is the ONLY thing that reaches `admin` in this vintage.
 *
 * This does not call `createInMemoryIdentityRouteDeps`/`identityReady` directly: that promise chain
 * kicks off `seedIdentity` immediately and fires `migrateDeprecatedPermissionGrants` off its
 * resolution internally, with no exposed seam to rewind the admin policy in between the two without
 * racing that chain's own microtask ordering — which is exactly the kind of timing-dependent fixture
 * this repo's tests are written not to rely on. Instead this runs the identical three calls
 * `features/identity/wiring.ts`'s `buildIdentityRouteDeps` makes, in the same order, over the same
 * real `@jini-ai/cms/identity` functions and the same `applyBuiltinRoleGrants` this file already
 * imports — so a change to that composition's ORDER or to which functions run would need a matching
 * change here to stay green.
 *
 * Delete the `applyBuiltinRoleGrants` call below and this test goes red immediately: proof this
 * assertion — unlike the fresh-vintage one above — actually depends on the backfill.
 */
test("createInMemoryIdentityRouteDeps' own boot sequence grants pages.edit_html to admin in a pre-theme.edit (already-deployed) workspace, where the fan-out alone grants nothing (SPEC-047 REQ-9)", async () => {
  const workspaceId = "workspace-pre-theme-edit-builtin-role-grant";
  const repos: IdentityRepos = {
    principals: new InMemoryPrincipalRepo(),
    users: new InMemoryUserRepo(),
    sessions: new InMemorySessionRepo(),
    roles: new InMemoryRoleRepo(),
    policies: new InMemoryPolicyRepo(),
    policyPermissions: new InMemoryPolicyPermissionRepo(),
    rolePolicies: new InMemoryRolePolicyRepo(),
    principalRoles: new InMemoryPrincipalRoleRepo(),
    principalPolicies: new InMemoryPrincipalPolicyRepo(),
  };
  const fakeHasher = { hash: async (p: string) => `hashed:${p}`, verify: async (h: string, p: string) => h === `hashed:${p}` };

  await seedIdentity({
    deps: { repos, hasher: fakeHasher, clock: fixedClock, idGen: counterIdGen() },
    input: { workspaceId, ownerUsername: "owner-under-test", ownerPassword: "irrelevant" },
  });

  await dropAdminThemeEdit(repos, workspaceId);

  await migrateDeprecatedPermissionGrants({
    policyPermissions: repos.policyPermissions,
    policies: repos.policies,
    idGen: counterIdGen(),
    workspaceId,
  });

  await applyBuiltinRoleGrants({
    roles: repos.roles,
    rolePolicies: repos.rolePolicies,
    policies: repos.policies,
    policyPermissions: repos.policyPermissions,
    idGen: counterIdGen(),
    workspaceId,
  });

  const permissionsOfPolicyNamed = async (name: string) => {
    const policy = await repos.policies.findByName({ workspaceId, name });
    assert.ok(policy, `seedIdentity must have created '${name}'`);
    return (await repos.policyPermissions.listByPolicyId({ workspaceId, policyId: policy.id })).map(
      (row) => row.permission
    );
  };

  assert.ok(
    (await permissionsOfPolicyNamed("admin-builtin-policy")).includes(PAGES_EDIT_HTML_PERMISSION),
    "admin must hold pages.edit_html in an already-seeded workspace too — the grant cannot depend on a seed row that workspace never got"
  );

  // The refusals are the assertions that matter, same as the fresh-vintage case: a backfill that
  // reached these would BE the SPEC-047 REQ-9 vulnerability, not a wiring bug.
  for (const name of ["editor-builtin-policy", "viewer-builtin-policy"] as const) {
    assert.ok(
      !(await permissionsOfPolicyNamed(name)).includes(PAGES_EDIT_HTML_PERMISSION),
      `${name} must NOT gain raw-page-HTML authoring`
    );
  }

  assert.deepEqual(
    await permissionsOfPolicyNamed("owner-builtin-policy"),
    ["*"],
    "the owner policy stays exactly its seeded wildcard"
  );
});

/** Idempotence at the boot seam: two boots over the same repos must not double-write the row. */
test("createInMemoryIdentityRouteDeps: a second identityReady over the same repos adds no duplicate pages.edit_html row", async () => {
  const workspaceId = "workspace-builtin-role-grant-idempotent";
  const shared = createInMemoryIdentityRouteDeps({ workspaceId, clock: fixedClock, idGen: counterIdGen() });
  await shared.identityReady;

  await applyBuiltinRoleGrants({
    roles: shared.roleRepo,
    rolePolicies: shared.rolePolicyRepo,
    policies: shared.policyRepo,
    policyPermissions: shared.policyPermissionRepo,
    idGen: counterIdGen(),
    workspaceId,
  });

  const policy = await shared.policyRepo.findByName({ workspaceId, name: "admin-builtin-policy" });
  assert.ok(policy);
  const rows = (await shared.policyPermissionRepo.listByPolicyId({ workspaceId, policyId: policy.id })).filter(
    (row) => row.permission === PAGES_EDIT_HTML_PERMISSION
  );
  assert.equal(rows.length, 1, "re-running the backfill must no-op, not append a second grant row");
});
