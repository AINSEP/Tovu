/** Member password workflows (OPUS-REVIEW shard C); transport limits/CSRF belong to shard D. */
import { nowIso as clockNowIso } from "@jini-ai/core/primitives";
import { validatePasswordPolicy } from "@jini-ai/user-management/server";
import type { MemberSignInResult, MembersWriteServiceDeps } from "./ports.js";
import { MemberAuthError, MemberValidationError, type MemberRecord } from "./types.js";
import {
  consumeMemberChallenge, dummyPasswordHash, issueMemberSession, memberPasswordHasher, requestMemberChallenge,
} from "./write-service.js";

/** Pending and disabled members cannot obtain a password session, even with a matching hash. */
function requireActiveMember({ member }: { member: MemberRecord | null }, _options = {}): MemberRecord {
  if (!member || member.status !== "active") throw new MemberAuthError("INVALID_CREDENTIALS");
  return member;
}

/**
 * Verify exactly once for every account class, then re-read the credential after session save.
 * Missing, passwordless, pending, disabled, trashed and wrong-password accounts share one error.
 * @throws MemberAuthError("INVALID_CREDENTIALS"); adapter errors propagate.
 * @complexity O(1) indexed reads and one Argon2 verify; password bytes remain unmodified.
 * @example signInWithPassword({ deps, input: { workspaceId, email, password } })
 */
export async function signInWithPassword(required: {
  deps: MembersWriteServiceDeps;
  input: { workspaceId: string; email: string; password: string; userAgent?: string; ip?: string };
}, _options = {}): Promise<MemberSignInResult> {
  const { deps, input } = required;
  const nowIso = clockNowIso({ clock: deps.clock });
  const email = input.email.trim().toLowerCase();
  const hasher = memberPasswordHasher({ deps });
  const member = await deps.members.findByEmail({ workspaceId: input.workspaceId, email });
  const credential = member ? { workspaceId: input.workspaceId, memberId: member.id } : null;
  const hash = credential ? await deps.members.findPasswordHash(credential) : null;
  const verified = await hasher.verify({ hash: hash ?? await dummyPasswordHash({ hasher }), password: input.password });
  if (!verified || !hash) throw new MemberAuthError("INVALID_CREDENTIALS");
  const active = requireActiveMember({ member });
  // Read status again too: an administrative disable can race the expensive Argon2 verify.
  const current = await deps.members.findById({ workspaceId: input.workspaceId, id: active.id });
  const currentMember = requireActiveMember({ member: current });
  const result = await issueMemberSession({ deps, member: currentMember, nowIso }, { userAgent: input.userAgent, ip: input.ip });
  // Reset writes the hash, then revokes every session. Re-reading AFTER the save closes the race
  // without locks or clock order: an unchanged hash means a later reset's revoke-all covers it.
  const currentHash = await deps.members.findPasswordHash({ workspaceId: input.workspaceId, memberId: active.id });
  if (currentHash !== hash) {
    await deps.sessions.revoke({ workspaceId: input.workspaceId, id: result.session.id, revokedAt: nowIso });
    throw new MemberAuthError("INVALID_CREDENTIALS");
  }
  return result;
}

/**
 * Request a link-only reset for an existing eligible member; never reveal per-address outcomes.
 * Reuses the sign-in mail setup checks and interactive lane. No member is created.
 * @throws MemberSignInUnavailableError for site-wide mail/origin setup errors.
 * @complexity O(1) adapter calls.
 */
export async function requestPasswordReset(required: {
  deps: MembersWriteServiceDeps; input: { workspaceId: string; email: string };
}, _options = {}): Promise<{ accepted: true }> {
  await requestMemberChallenge({ ...required, purpose: "password_reset" });
  return { accepted: true };
}

/** Disabled/trashed members and links issued before a credential cutoff get the generic 401. O(1). */
function resettableMember({ member, createdAt }: { member: MemberRecord | null; createdAt: string }, _options = {}): MemberRecord {
  if (!member || member.status === "disabled" || member.status === "trash"
    || (member.credentialsRevokedAt && member.credentialsRevokedAt >= createdAt)) {
    throw new MemberAuthError("sign-in credential is invalid");
  }
  return member;
}

/**
 * Link-only reset, with no session: consume -> hash -> revoke every session + cutoff -> profile.
 * Revocation precedes the profile save, so a profile write conflict can never leave old sessions.
 * The cutoff invalidates outstanding links/codes, including challenges issued at the same tick.
 * @throws MemberValidationError for empty/>512-code-point passwords; generic MemberAuthError for credentials.
 * @complexity O(n + s), password length n and member sessions s; hashing cost is adapter-owned.
 * @example resetPassword({ deps, input: { workspaceId, token, password: "x" } })
 */
export async function resetPassword(required: {
  deps: MembersWriteServiceDeps; input: { workspaceId: string; token: string; password: string };
}, _options = {}): Promise<{ ok: true }> {
  const { deps, input } = required;
  const policyError = validatePasswordPolicy({ password: input.password });
  if (policyError) throw new MemberValidationError(policyError);
  const nowIso = clockNowIso({ clock: deps.clock });
  const record = await consumeMemberChallenge({ deps, input: { workspaceId: input.workspaceId, token: input.token }, purpose: "password_reset", nowIso });
  const member = resettableMember({
    member: await deps.members.findById({ workspaceId: input.workspaceId, id: record.memberId }), createdAt: record.createdAt,
  });
  const passwordHash = await memberPasswordHasher({ deps }).hash({ password: input.password });
  await deps.members.setPasswordHash({ workspaceId: input.workspaceId, memberId: member.id, passwordHash });
  await deps.sessions.revokeAllForMember({ workspaceId: input.workspaceId, memberId: member.id, revokedAt: nowIso });
  // The reset link proves the inbox, so it verifies the email and activates a pending member.
  await deps.members.save({ ...member, credentialsRevokedAt: nowIso, emailVerifiedAt: member.emailVerifiedAt ?? nowIso,
    status: member.status === "pending" ? "active" : member.status, updatedAt: nowIso, version: member.version + 1 });
  return { ok: true };
}
