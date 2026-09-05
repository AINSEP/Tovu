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
import "@jini-ai/cms/identity";
// Side-effect import, same shape as the line above and for the same reason: loading the Pages
// barrel is what registers this repo's OWN permission-migration pair (theme.edit ->
// pages.edit_html, `features/pages/permissions.ts`). Registered by a host rather than by the
// library, which is the seam `registerPermissionMigration` is exported for.
import { PAGES_EDIT_HTML_PERMISSION } from "#src/features/pages/index";
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
