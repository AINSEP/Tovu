import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { login, AuthInvalidCredentialsError, type AuthServiceDeps, type IdentityRepos } from "@jini-ai/cms/identity";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteDbOpsAdapter } from "#src/platform/db/sqlite/db-ops";
import { identityUsers } from "#src/platform/db/schema";
import { createSqliteIdentityRouteDeps } from "../wiring.js";
import {
  resetAdminPasswordSelfVerified,
  AdminPasswordResetVerificationFailedError,
} from "../reset-admin-password-self-verified.js";

/**
 * @file The mandatory proof for `reset-admin-password-self-verified.ts` — the module written after
 * a 2026-09-03 production incident where the admin UI's own reset-password flow reported success
 * but left the account unable to log in with either the old or the new password.
 *
 * Both tests use a real on-disk `content.db` and the REAL `SqliteDbOpsAdapter` (not a stub) — the
 * second test's whole point is proving a real restore-point capture + restore round-trips
 * correctly, which a mocked `dbOps` could not demonstrate.
 */

const WORKSPACE = "workspace-reset-admin-pw-test";
const fixedClock = { nowIso: () => "2026-09-03T00:00:00.000Z" };

function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

function tmpDbPath(prefix: string): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, dbPath: join(dir, "content.db") };
}

test("resetAdminPasswordSelfVerified: resets the seeded owner's password, self-verifies, and the new password (not the old) logs in through the real hasher", async () => {
  const { dir, dbPath } = tmpDbPath("reset-admin-pw-happy-");
  try {
    const db = openContentDb(dbPath);
    const identity = createSqliteIdentityRouteDeps({ db, workspaceId: WORKSPACE, clock: fixedClock, idGen: counterIdGen() });
    await identity.identityReady;

    const repos: IdentityRepos = {
      principals: identity.principalRepo,
      users: identity.userRepo,
      sessions: identity.sessionRepo,
      roles: identity.roleRepo,
      policies: identity.policyRepo,
      policyPermissions: identity.policyPermissionRepo,
      rolePolicies: identity.rolePolicyRepo,
      principalRoles: identity.principalRoleRepo,
      principalPolicies: identity.principalPolicyRepo,
    };
    const auth: AuthServiceDeps = { repos, hasher: identity.passwordHasher, clock: fixedClock, idGen: counterIdGen() };
    const dbOps = new SqliteDbOpsAdapter({ db, filePath: dbPath });

    const ownerBefore = await identity.userRepo.findByUsername({ workspaceId: WORKSPACE, username: "admin" });
    assert.ok(ownerBefore, "the seeded owner user must exist before this test's reset");

    const result = await resetAdminPasswordSelfVerified(
      { auth, dbOps, ownerPrincipalId: identity.ownerPrincipalId },
      { workspaceId: WORKSPACE, username: "admin", password: "recovered-pw-123456", restorePointScopeId: "test-happy" }
    );
    assert.equal(result.principalId, ownerBefore!.principalId);

    // The NEW password logs in end-to-end through the real login() path, not just this module's
    // own internal verify() call.
    const { principal } = await login({ deps: auth, input: { workspaceId: WORKSPACE, username: "admin", password: "recovered-pw-123456" } });
    assert.equal(principal.id, ownerBefore!.principalId);

    // The OLD (seed-default) password must no longer work.
    await assert.rejects(
      () => login({ deps: auth, input: { workspaceId: WORKSPACE, username: "admin", password: "tovu-dev" } }),
      AuthInvalidCredentialsError
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resetAdminPasswordSelfVerified: a write that does not verify is caught before reporting success, and content.db is restored to its pre-reset state", async () => {
  const { dir, dbPath } = tmpDbPath("reset-admin-pw-corrupt-");
  try {
    const db = openContentDb(dbPath);
    const identity = createSqliteIdentityRouteDeps({ db, workspaceId: WORKSPACE, clock: fixedClock, idGen: counterIdGen() });
    await identity.identityReady;

    const repos: IdentityRepos = {
      principals: identity.principalRepo,
      users: identity.userRepo,
      sessions: identity.sessionRepo,
      roles: identity.roleRepo,
      policies: identity.policyRepo,
      policyPermissions: identity.policyPermissionRepo,
      rolePolicies: identity.rolePolicyRepo,
      principalRoles: identity.principalRoleRepo,
      principalPolicies: identity.principalPolicyRepo,
    };

    const ownerBefore = await identity.userRepo.findByUsername({ workspaceId: WORKSPACE, username: "admin" });
    assert.ok(ownerBefore, "the seeded owner user must exist before this test's reset");
    const hashBefore = ownerBefore!.passwordHash;

    // Deliberately-injected bug (per this module's own regression-test discipline): a hasher whose
    // hash() is the real argon2id implementation (so resetUserPassword's write looks completely
    // normal) but whose verify() always reports false — simulating exactly the incident's failure
    // mode, "a hash gets written that doesn't verify against the password that produced it."
    const brokenHasher = {
      hash: (password: string) => identity.passwordHasher.hash(password),
      verify: async () => false,
    };
    const auth: AuthServiceDeps = { repos, hasher: brokenHasher, clock: fixedClock, idGen: counterIdGen() };
    const dbOps = new SqliteDbOpsAdapter({ db, filePath: dbPath });

    await assert.rejects(
      () =>
        resetAdminPasswordSelfVerified(
          { auth, dbOps, ownerPrincipalId: identity.ownerPrincipalId },
          { workspaceId: WORKSPACE, username: "admin", password: "should-never-verify-123456", restorePointScopeId: "test-corrupt" }
        ),
      AdminPasswordResetVerificationFailedError
    );

    // The restore swaps the on-disk file; the already-open `db`/`identity` connection keeps its own
    // file descriptor to the now-unlinked pre-restore inode (SqliteDbOpsAdapter's own doc), so
    // proving the restore actually happened requires a FRESH connection to the same path.
    db.$client.close();
    const reopened = openContentDb(dbPath);
    const ownerAfter = reopened.select().from(identityUsers).all();
    const restoredRow = ownerAfter.find((row) => row.principalId === ownerBefore!.principalId);
    assert.ok(restoredRow, "the owner row must still exist after restore");
    assert.equal(restoredRow!.passwordHash, hashBefore, "content.db must be restored to its exact pre-reset state, not left half-applied");
    reopened.$client.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
