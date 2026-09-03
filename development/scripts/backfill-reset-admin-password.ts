/**
 * One-off, manually-run recovery script: force-resets one user's (default `admin`'s) password
 * directly against `content.db`, bypassing the admin UI/HTTP reset-password route entirely — for
 * the case where that route itself is the thing that's broken (2026-09-03 production incident: the
 * admin UI's own "Reset password" ran with no error, and afterward neither the old nor the new
 * password logged in).
 *
 * ## Why this cannot be "just call the HTTP route"
 *
 * The whole reason this script exists is that the HTTP route was already tried and failed
 * silently. This script instead opens `content.db` directly and drives the SAME core library call
 * (`@jini-ai/cms`'s `resetUserPassword`, via `apps/website/src/features/identity/
 * reset-admin-password-self-verified.ts`) the route itself calls — same hashing, same
 * session-revocation — but self-verifies the write before ever reporting success. See that
 * module's own header for the full design and why self-verification is the point.
 *
 * ## Safety
 *
 * Dry-run by default; `--apply` is required to write, and even then only after a restore point is
 * captured (`SqliteDbOpsAdapter`, the same online-backup mechanism every other `backfill-*.ts`
 * script here uses). Unlike those scripts, this one is NOT idempotent in the "second run is a
 * no-op" sense — every `--apply` run always re-hashes and re-writes (see
 * `reset-admin-password-self-verified.ts`'s own "idempotent in outcome, not byte-for-byte" note) —
 * but it IS safe to re-run: the target row's existing state is never read, only overwritten, so a
 * row already in an unknown/corrupted state cannot affect this script.
 *
 * The new password is never hardcoded here. Preferred: the `TOVU_ADMIN_RESET_PASSWORD` env var
 * (keeps it out of shell history, the same reasoning `TOVU_INTEGRATIONS_ROOT_KEY` follows for every
 * other secret-ish input in this directory). Falls back to `--password=<value>` for a caller that
 * cannot set env vars (e.g. a one-line Fly console command) — that caller accepts the shell-history
 * exposure knowingly.
 *
 * ## Usage
 *
 *   TOVU_ADMIN_RESET_PASSWORD=<new-password> npx tsx development/scripts/backfill-reset-admin-password.ts --db sites/<site>/content.db
 *   npx tsx development/scripts/backfill-reset-admin-password.ts --db sites/<site>/content.db --password=<new-password> --apply
 *   npx tsx development/scripts/backfill-reset-admin-password.ts --db sites/<site>/content.db --username=admin --apply   (TOVU_ADMIN_RESET_PASSWORD set)
 *
 * `--username` defaults to `admin`. `--db` defaults to `<repo>/infra/content.db` (matching every
 * sibling `backfill-*.ts` script's own default) — that path does not exist in a normal checkout, so
 * always pass `--db sites/<site>/content.db` explicitly against a real site.
 *
 * A dry run resolves the target user and reports whether it exists — it never touches the hasher,
 * never captures a restore point, never writes.
 *
 * Exit codes: `0` on a successful `--apply` (write + self-verification both succeeded), or a dry
 * run that found the target; `1` if the target user does not exist, or the write's self-
 * verification fails (restored from the restore point captured just before the write — see
 * `reset-admin-password-self-verified.ts`).
 */
import { randomUUID } from "node:crypto";
import path from "node:path";

import type { IdentityRepos } from "@jini-ai/cms/identity";

import { openContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
import { resolveWorkspace } from "../../apps/website/src/platform/site-dir/resolve-workspace.js";
import { createSqliteIdentityRouteDeps } from "../../apps/website/src/features/identity/wiring.js";
import {
  resetAdminPasswordSelfVerified,
  AdminPasswordResetVerificationFailedError,
} from "../../apps/website/src/features/identity/reset-admin-password-self-verified.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

interface Args {
  readonly dbPath: string;
  readonly username: string;
  readonly password: string | undefined;
  readonly apply: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const dbFlag = argv.indexOf("--db");
  const usernameFlag = argv.find((a) => a.startsWith("--username="));
  const passwordFlag = argv.find((a) => a.startsWith("--password="));
  return {
    dbPath: dbFlag === -1 ? path.join(REPO_ROOT, "infra", "content.db") : path.resolve(argv[dbFlag + 1]),
    username: usernameFlag ? usernameFlag.slice("--username=".length) : "admin",
    // Env var preferred (keeps the secret out of shell history) — see this file's own header.
    password: process.env.TOVU_ADMIN_RESET_PASSWORD ?? (passwordFlag ? passwordFlag.slice("--password=".length) : undefined),
    apply: argv.includes("--apply"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = openContentDb(args.dbPath);
  const workspaceId = resolveWorkspace({ db }).id;

  const clock = { nowIso: () => new Date().toISOString() };
  const idGen = { newId: () => randomUUID() };
  const identity = createSqliteIdentityRouteDeps({ db, workspaceId, clock, idGen });
  await identity.identityReady;

  const target = await identity.userRepo.findByUsername({ workspaceId, username: args.username });
  if (!target) {
    console.error(`User '${args.username}' was not found in workspace '${workspaceId}' at ${args.dbPath}.`);
    process.exitCode = 1;
    return;
  }

  if (!args.apply) {
    console.log(
      `DRY RUN: found user '${args.username}' (principalId=${target.principalId}) in workspace '${workspaceId}'. ` +
        `Re-run with --apply and TOVU_ADMIN_RESET_PASSWORD (or --password=) set to write a new password.`
    );
    return;
  }

  if (!args.password) {
    console.error(
      "Refusing to --apply with no new password: set TOVU_ADMIN_RESET_PASSWORD or pass --password=<new-password>."
    );
    process.exitCode = 1;
    return;
  }

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
  const dbOps = new SqliteDbOpsAdapter({ db, filePath: args.dbPath });

  try {
    await resetAdminPasswordSelfVerified(
      { auth: { repos, hasher: identity.passwordHasher, clock, idGen }, dbOps, log: (m) => console.log(m) },
      { workspaceId, username: args.username, password: args.password, restorePointScopeId: "backfill-reset-admin-password" }
    );
  } catch (err) {
    if (err instanceof AdminPasswordResetVerificationFailedError) {
      console.error(`FAILED (self-verification): ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  console.log(`Done: username='${args.username}' password reset and self-verified (fresh read-back through the real hasher).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
