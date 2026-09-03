import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { login, AuthInvalidCredentialsError, type AuthServiceDeps, type IdentityRepos } from "@jini-ai/cms/identity";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { workspaces } from "../../../apps/website/src/platform/db/schema.js";
import { createSqliteIdentityRouteDeps } from "../../../apps/website/src/features/identity/wiring.js";

/**
 * @file The CLI-level proof for `backfill-reset-admin-password.ts` — dry run touches nothing,
 * `--apply` with no password refuses to write, and a real `--apply` resets the seeded owner's
 * password such that the NEW password (not the old) authenticates through the real `login()` path
 * afterward. The self-verification-catches-a-corrupted-write proof itself lives at the unit level
 * in `apps/website/src/features/identity/__tests__/reset-admin-password-self-verified.test.ts`
 * (the module this script's core logic is factored into) — reproducing it here would mean adding a
 * test-only hook to the production script just to inject a broken hasher, which this file
 * deliberately does not do.
 *
 * Runs the real script as a child process (`execFileSync`), same reason every sibling
 * `backfill-*.test.ts` gives: `main()` runs unconditionally at import time.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "backfill-reset-admin-password.ts");
const WORKSPACE = "workspace-1";
const NOW = "2026-09-03T00:00:00.000Z";
const fixedClock = { nowIso: () => NOW };

function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runScript(dbPath: string, extraArgs: string[] = [], envOverrides: Record<string, string | undefined> = {}): string {
  const env = { ...process.env, ...envOverrides };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
  }
  return execFileSync("node", ["--import", "tsx", SCRIPT, "--db", dbPath, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env,
  });
}

/** Seeds a fresh content.db with a workspace row (required by the script's own `resolveWorkspace`
 *  call) and the standard identity seed (owner username `admin`, seed-default password `tovu-dev`,
 *  via `createSqliteIdentityRouteDeps`'s own first-boot seeding — the exact same seeding every real
 *  site's boot performs). */
async function seedWorkspaceAndIdentity(dbPath: string): Promise<void> {
  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  const identity = createSqliteIdentityRouteDeps({ db: seedDb, workspaceId: WORKSPACE, clock: fixedClock, idGen: counterIdGen() });
  await identity.identityReady;
  seedDb.$client.close();
}

test("backfill-reset-admin-password: dry run reports the target user and writes nothing; --apply with no password refuses to write", async () => {
  const scratch = tmpDir("backfill-reset-admin-password-dryrun-");
  const dbPath = path.join(scratch, "content.db");
  await seedWorkspaceAndIdentity(dbPath);

  const dryRunOutput = runScript(dbPath, [], { TOVU_ADMIN_RESET_PASSWORD: undefined });
  assert.match(dryRunOutput, /DRY RUN: found user 'admin'/);
  assert.doesNotMatch(dryRunOutput, /RESTORE POINT CAPTURED/);

  // --apply with no TOVU_ADMIN_RESET_PASSWORD and no --password= must refuse, not silently no-op.
  let threw = false;
  try {
    runScript(dbPath, ["--apply"], { TOVU_ADMIN_RESET_PASSWORD: undefined });
  } catch (err) {
    threw = true;
    const output = `${(err as { stderr?: string }).stderr ?? ""}`;
    assert.match(output, /Refusing to --apply with no new password/);
  }
  assert.equal(threw, true, "the process must exit non-zero rather than apply with no password");

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-reset-admin-password: --apply resets the seeded owner's password — the new password (not the old) authenticates afterward", async () => {
  const scratch = tmpDir("backfill-reset-admin-password-apply-");
  const dbPath = path.join(scratch, "content.db");
  await seedWorkspaceAndIdentity(dbPath);

  const applyOutput = runScript(dbPath, ["--apply"], { TOVU_ADMIN_RESET_PASSWORD: "recovered-pw-445566" });
  assert.match(applyOutput, /RESTORE POINT CAPTURED/);
  assert.match(applyOutput, /VERIFIED: username='admin'/);
  assert.match(applyOutput, /Done: username='admin' password reset and self-verified/);

  // Independent confirmation through the real login() path, not just the script's own claim.
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

  const { principal } = await login({ deps: auth, input: { workspaceId: WORKSPACE, username: "admin", password: "recovered-pw-445566" } });
  assert.ok(principal.id);

  await assert.rejects(
    () => login({ deps: auth, input: { workspaceId: WORKSPACE, username: "admin", password: "tovu-dev" } }),
    AuthInvalidCredentialsError,
    "the old seed-default password must no longer authenticate"
  );
  db.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-reset-admin-password: an unknown username fails loudly (non-zero exit) instead of silently doing nothing", async () => {
  const scratch = tmpDir("backfill-reset-admin-password-unknown-");
  const dbPath = path.join(scratch, "content.db");
  await seedWorkspaceAndIdentity(dbPath);

  let threw = false;
  try {
    runScript(dbPath, ["--username=does-not-exist"], { TOVU_ADMIN_RESET_PASSWORD: undefined });
  } catch (err) {
    threw = true;
    const output = `${(err as { stderr?: string }).stderr ?? ""}`;
    assert.match(output, /was not found/);
  }
  assert.equal(threw, true);

  fs.rmSync(scratch, { recursive: true, force: true });
});
