import { resetUserPassword, IdentityNotFoundError, type AuthServiceDeps } from "@jini-ai/cms/identity";

import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";

/**
 * @file Self-verifying admin/user password reset — the core logic shared by
 * `development/scripts/backfill-reset-admin-password.ts` (manual/CLI invocation) and
 * `server/runtime/composition/deps.ts`'s boot-time hook (`TOVU_ADMIN_RESET_PASSWORD`).
 *
 * Purpose:
 * Incident-driven (2026-09-03): the admin UI's own "Reset password" flow was used against
 * production, closed with no error, and afterward NEITHER the old nor the new password could log
 * in. Tracing `Users.tsx` -> `api.ts` -> the `reset-password` route -> `@jini-ai/cms`'s
 * `resetUserPassword` -> `Argon2PasswordHasher` found the LOCAL source of every one of those to be
 * logically correct (same hasher instance hashes and verifies; no double-hash; no wrong-field
 * write) — but Tovu's production image installs `@jini-ai/cms` from the npm registry
 * (`check-no-linked-jini.mjs`), not from this local Jini checkout, so a bug specific to the
 * published package (or to something else entirely) cannot be ruled out from here. This module
 * exists to make that irrelevant: it does not trust that a write succeeded just because
 * `resetUserPassword` returned without throwing — it re-reads the row fresh and calls
 * `hasher.verify()` against the exact password just set, through the SAME hasher instance the real
 * login path (`auth-service.ts`'s `login()`) uses. A hash that was written but does not verify is
 * exactly the failure this incident produced, and is now caught here instead of reported as
 * success.
 *
 * A restore point is captured immediately before the write (not reused across calls) so a failed
 * self-verification can restore `content.db` to its pre-reset state rather than leaving a
 * half-applied change behind — see `restoreFromArtifact`'s own `restartRequired: true` doc for the
 * one caveat: the CURRENT process's already-open db connection keeps serving from its own file
 * descriptor to the now-unlinked pre-restore inode until it restarts and reopens the path fresh: a
 * restore alone does not fix the current process's live connection.
 *
 * Idempotent in outcome, not byte-for-byte: argon2id salts randomly, so re-running with the same
 * password writes a DIFFERENT hash string each time — but the row always converges to "verifies
 * against the password just given," which is the only property either caller relies on. Safe
 * against a target row already in an unknown/corrupted state: the existing `passwordHash` is never
 * read, only overwritten, so a malformed prior hash cannot affect this call.
 *
 * Architectural role:
 * Ordinary feature-level function, same shape as `repo.sqlite.ts`'s adapters — no port, since
 * (like `auth-service.ts` itself) this has exactly one real implementation.
 */

export class AdminPasswordResetVerificationFailedError extends Error {}

export interface ResetAdminPasswordSelfVerifiedDeps {
  readonly auth: AuthServiceDeps;
  readonly dbOps: DbOpsPort;
  /** Defaults to a no-op. Injected so callers (tests, the CLI script, the boot hook) can route
   *  progress output wherever they need it without this function knowing where that is. */
  readonly log?: (message: string) => void;
}

export interface ResetAdminPasswordSelfVerifiedInput {
  readonly workspaceId: string;
  readonly username: string;
  readonly password: string;
  /** Restore-point scope id (e.g. `"backfill-reset-admin-password"` for the CLI script,
   *  `"boot-admin-password-reset"` for the boot hook) — kept caller-specific so the two never share
   *  or collide over the same artifact namespace. */
  readonly restorePointScopeId: string;
}

export interface ResetAdminPasswordSelfVerifiedResult {
  readonly principalId: string;
}

/**
 * Resets `username`'s password via the REAL `resetUserPassword` transition (same hashing, same
 * session-revocation), then proves the write actually took by re-reading the row and verifying it
 * against `input.password` through the same hasher — see this file's header for why that proof is
 * the entire point.
 *
 * The caller for `resetUserPassword`'s own permission gate is the target itself: an admin/owner
 * account resetting its own credential always holds `user.manage` over itself (the seeded owner
 * holds the unconstrained wildcard; a non-owner admin with `user.manage` granted also passes), so
 * no separate "caller" principal needs to be resolved for this out-of-band, DB-level recovery path.
 *
 * @throws {IdentityNotFoundError} `username` has no row in `workspaceId`.
 * @throws {AdminPasswordResetVerificationFailedError} the write did not verify — the restore point
 *   captured just before the write has already been restored to by the time this throws.
 * @complexity O(s) in the target's active session count (`resetUserPassword`'s own bound) plus one
 *   full-file restore-point capture — see `SqliteDbOpsAdapter.captureRestorePoint`'s own doc.
 */
export async function resetAdminPasswordSelfVerified(
  deps: ResetAdminPasswordSelfVerifiedDeps,
  input: ResetAdminPasswordSelfVerifiedInput
): Promise<ResetAdminPasswordSelfVerifiedResult> {
  const log = deps.log ?? (() => {});
  const { auth, dbOps } = deps;

  const target = await auth.repos.users.findByUsername({ workspaceId: input.workspaceId, username: input.username });
  if (!target) {
    throw new IdentityNotFoundError(`user '${input.username}' was not found in workspace '${input.workspaceId}'`);
  }

  const restorePoint = await dbOps.captureRestorePoint({ scopeId: input.restorePointScopeId });
  log(`RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`);

  await resetUserPassword({
    deps: auth,
    input: {
      workspaceId: input.workspaceId,
      callerPrincipalId: target.principalId,
      principalId: target.principalId,
      password: input.password,
    },
  });
  log(`resetUserPassword() returned for username='${input.username}' — verifying before reporting success.`);

  // THE self-verification step this module exists for (see file header) — never trust the write
  // succeeded just because resetUserPassword() did not throw.
  const fresh = await auth.repos.users.findByPrincipalId({ workspaceId: input.workspaceId, principalId: target.principalId });
  const verified = fresh !== null && (await auth.hasher.verify(fresh.passwordHash, input.password));

  if (!verified) {
    log(`SELF-VERIFICATION FAILED for username='${input.username}' — restoring content.db from the restore point captured before this write.`);
    const restore = await dbOps.restoreFromArtifact({ artifactRef: restorePoint.artifactRef });
    throw new AdminPasswordResetVerificationFailedError(
      `password reset for '${input.username}' was written but the fresh row did NOT verify against the password ` +
        `just set — restored content.db from artifactRef='${restorePoint.artifactRef}' (restartRequired=${restore.restartRequired}); ` +
        `refusing to report success`
    );
  }

  log(`VERIFIED: username='${input.username}' authenticates with the new password (fresh read-back + hasher.verify()).`);
  return { principalId: target.principalId };
}
