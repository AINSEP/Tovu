import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { login, AuthInvalidCredentialsError, type AuthServiceDeps, type IdentityRepos } from "@jini-ai/cms/identity";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { workspaces } from "../../../apps/website/src/platform/db/schema.js";
import { createSqliteIdentityRouteDeps, DEFAULT_OWNER_PASSWORD } from "../../../apps/website/src/features/identity/wiring.js";
import { missingDbPathMessage } from "../backfill-db-path.js";

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

/** Counts real tables in a SQLite file via a fresh read-only connection — never through the
 *  content-db helpers under test, so this stays an independent witness of the file's actual state. */
function countTables(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get() as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}

/** Reads a named built-in policy's held permissions via raw SQL on a fresh read-only connection —
 *  same independent-witness reasoning as `countTables`: this must not go through
 *  `createSqliteIdentityRouteDeps`/any repo this script itself uses, or a bug in the thing under
 *  test could mask itself from its own assertion. */
function permissionsOfBuiltinPolicy(dbPath: string, policyName: string): string[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        `SELECT pp.permission AS permission
         FROM policy_permissions pp
         JOIN policies p ON p.id = pp.policy_id
         WHERE p.name = ?`
      )
      .all(policyName) as { permission: string }[];
    return rows.map((r) => r.permission);
  } finally {
    db.close();
  }
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

/** Same as `runScript`, but passes `--db=<path>` as a single `=`-joined token instead of the
 *  space-separated `--db <path>` form — this script's own `--username=`/`--password=` flags only
 *  ever use the `=` form, so an operator naturally reaches for it with `--db` too. */
function runScriptDbEquals(dbPath: string, extraArgs: string[] = [], envOverrides: Record<string, string | undefined> = {}): string {
  const env = { ...process.env, ...envOverrides };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
  }
  return execFileSync("node", ["--import", "tsx", SCRIPT, `--db=${dbPath}`, ...extraArgs], {
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

test("backfill-reset-admin-password: --apply with a whitespace-only password refuses to write, instead of hashing the literal whitespace as the new password", async () => {
  const scratch = tmpDir("backfill-reset-admin-password-blankpw-");
  const dbPath = path.join(scratch, "content.db");
  await seedWorkspaceAndIdentity(dbPath);

  // The defect this guards: `--password="   "` (or TOVU_ADMIN_RESET_PASSWORD="   ") is truthy, so
  // it passed the old `!args.password` guard unchanged and got hashed as the literal new password —
  // a copy-paste/blank-secret accident that "succeeds" silently, discovered only on the next login
  // attempt. Deliberately NOT trimmed instead: trailing/leading whitespace can be a meaningful part
  // of a real password, so a non-blank password with incidental whitespace must pass through as-is.
  let threw = false;
  let stderr = "";
  try {
    runScript(dbPath, ["--apply"], { TOVU_ADMIN_RESET_PASSWORD: "   " });
  } catch (err) {
    threw = true;
    stderr = `${(err as { stderr?: string }).stderr ?? ""}`;
  }
  assert.equal(threw, true, "the process must exit non-zero rather than apply a whitespace-only password");
  assert.match(stderr, /Refusing to --apply with no new password/);

  // THE MANDATORY PROOF: assert on real state, not just the log line — the seed-default password
  // must still authenticate, confirming nothing was actually written.
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
  // Not hardcoded "tovu-dev": `createSqliteIdentityRouteDeps` seeds with
  // `process.env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD` (`wiring.ts`), and this ambient
  // override IS set in some environments (see the repo's own test-running notes on this exact env
  // var) — asserting the literal default here would falsely pass or fail depending on the
  // environment this test happens to run in, independent of whether the refusal actually worked.
  const seedPassword = process.env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD;
  const { principal } = await login({ deps: auth, input: { workspaceId: WORKSPACE, username: "admin", password: seedPassword } });
  assert.ok(principal.id, "the seed-default password must still authenticate — the refused apply must not have written anything");
  db.$client.close();

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

test("backfill-reset-admin-password: a dry run against a not-yet-migrated content.db must not migrate it or write anything — asserted on the actual file, not a log line", () => {
  const scratch = tmpDir("backfill-reset-admin-password-nomigrate-");
  const dbPath = path.join(scratch, "content.db");

  // A bare SQLite file with zero tables. Nothing has ever opened this through `openContentDb`, so
  // if the dry-run path calls it unconditionally (the defect), the ENTIRE schema gets created —
  // not a subtle diff, a jump from 0 tables to the full migrated set.
  new Database(dbPath).close();
  assert.equal(countTables(dbPath), 0, "fixture must start with zero tables");
  const bytesBefore = fs.readFileSync(dbPath);

  let threw = false;
  try {
    runScript(dbPath, [], { TOVU_ADMIN_RESET_PASSWORD: undefined });
  } catch {
    // Expected post-fix: a genuinely read-only open leaves the `workspaces` table absent, so
    // `resolveWorkspace()` fails loudly ("no such table") instead of silently mutating the file.
    threw = true;
  }
  assert.equal(threw, true, "a dry run against an unmigrated db must fail loudly, not silently succeed");

  assert.equal(countTables(dbPath), 0, "dry run must not have created any tables — it must never call migrate()");
  assert.deepEqual(fs.readFileSync(dbPath), bytesBefore, "dry run must not modify the database file at all");

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-reset-admin-password: a mistyped --db path fails loudly and creates nothing, instead of silently opening an empty database", () => {
  const scratch = tmpDir("backfill-reset-admin-password-missingdb-");
  const missing = path.join(scratch, "content.db"); // deliberately never created

  let threw = false;
  let stderr = "";
  try {
    runScript(missing, [], { TOVU_ADMIN_RESET_PASSWORD: undefined });
  } catch (err) {
    threw = true;
    stderr = `${(err as { stderr?: string }).stderr ?? ""}`;
  }
  assert.equal(threw, true, "the script must fail rather than silently succeed against a missing db");
  assert.equal(stderr.includes(missingDbPathMessage(path.resolve(missing))), true, `expected the exact missing-db message. Got:\n${stderr}`);
  // The defect this guards: a typo'd path used to open (and migrate) a brand-new empty db, so the
  // failure surfaced as "user not found" — indistinguishable from a real missing user.
  assert.doesNotMatch(stderr, /was not found/, "must fail on the missing DATABASE, not report the target USER as not found");
  assert.equal(fs.existsSync(missing), false, "the script must not have created a database at the missing path");

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-reset-admin-password: --db=<path> (the same '=' form --username=/--password= already use) resolves the real database, instead of silently falling back to the missing default", async () => {
  const scratch = tmpDir("backfill-reset-admin-password-dbequals-");
  const dbPath = path.join(scratch, "content.db");
  await seedWorkspaceAndIdentity(dbPath);

  // The defect this guards: pre-fix, parseArgs() only recognized the exact `--db <path>` token
  // pair, so `--db=<path>` was silently ignored and fell back to the (nonexistent, per this file's
  // own header) default REPO_ROOT/infra/content.db, surfacing as "database not found" at the WRONG
  // path instead of finding the real one this test seeded.
  const dryRunOutput = runScriptDbEquals(dbPath, [], { TOVU_ADMIN_RESET_PASSWORD: undefined });
  assert.match(dryRunOutput, /DRY RUN: found user 'admin'/);

  fs.rmSync(scratch, { recursive: true, force: true });
});

/**
 * The concrete "unwired call site" fix: this script previously built identity deps without
 * importing `features/pages/index.js`, so `identityReady`'s boot-time reconciliation ran against an
 * EMPTY registry here — the `theme.edit -> pages.edit_html` migration and the `admin ->
 * pages.edit_html` built-in-role grant (SPEC-047 REQ-9) that every real server boot applies never
 * reached this script's own `--apply` writes. `seedWorkspaceAndIdentity` above deliberately does
 * NOT import the Pages barrel either, so the DB it produces starts in exactly that gap: admin holds
 * `theme.edit` (from the base seed) but not yet `pages.edit_html`.
 *
 * The dry-run half guards the hazard the fix itself introduced: `identityReady` now attempts that
 * same reconciliation on every invocation, and a dry run's connection is genuinely read-only
 * (`openContentDbReadOnly`) — without `reconcileGrantsOnBoot: args.apply` gating it (see wiring.ts),
 * this exact fixture would make a dry run crash instead of safely reporting.
 */
test("backfill-reset-admin-password: --apply reconciles this repo's own pages.edit_html grant onto admin, same as a real server boot; a dry run against the identical gap neither writes nor crashes", async () => {
  const scratch = tmpDir("backfill-reset-admin-password-pages-grant-");
  const dbPath = path.join(scratch, "content.db");
  await seedWorkspaceAndIdentity(dbPath);

  assert.deepEqual(
    permissionsOfBuiltinPolicy(dbPath, "admin-builtin-policy").includes("pages.edit_html"),
    false,
    "fixture precondition: the fresh seed above must NOT already hold pages.edit_html"
  );

  const dryRunOutput = runScript(dbPath, [], { TOVU_ADMIN_RESET_PASSWORD: undefined });
  assert.match(dryRunOutput, /DRY RUN: found user 'admin'/);
  assert.deepEqual(
    permissionsOfBuiltinPolicy(dbPath, "admin-builtin-policy").includes("pages.edit_html"),
    false,
    "a dry run must not have written the grant — its connection is read-only"
  );

  runScript(dbPath, ["--apply"], { TOVU_ADMIN_RESET_PASSWORD: "recovered-pw-778899" });
  assert.deepEqual(
    permissionsOfBuiltinPolicy(dbPath, "admin-builtin-policy").includes("pages.edit_html"),
    true,
    "--apply must reconcile the same admin -> pages.edit_html grant a real server boot would"
  );

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-reset-admin-password: --db= with no value fails loudly instead of resolving to an empty/unintended path", () => {
  let threw = false;
  let stderr = "";
  try {
    execFileSync("node", ["--import", "tsx", SCRIPT, "--db="], { cwd: REPO_ROOT, encoding: "utf8" });
  } catch (err) {
    threw = true;
    stderr = `${(err as { stderr?: string }).stderr ?? ""}`;
  }
  assert.equal(threw, true, "an empty --db= value must fail rather than silently resolve to some default");
  assert.match(stderr, /--db= requires a path/);
});
