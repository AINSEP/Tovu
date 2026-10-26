import { nowIso as clockNowIso } from "@jini-ai/core/primitives";
/**
 * @file `MembersWriteService` implementation (ADR-030 §3/§6, plus the member sign-in amendment).
 *
 * The single write chokepoint for member-domain mutations: email sign-in (link + code), profile
 * updates, disable-only lifecycle and comp/subscription changes, plus the host adapters for
 * Jini's shared email-challenge primitives. Plain async functions taking `{ deps, input }`.
 *
 * New-address challenges reserve a member id and carry the email, without creating a member or
 * principal. Consumption resolves that email again and creates the member then. Legacy
 * challenges without an email remain bound to their existing member id.
 */
import { randomInt } from "node:crypto";
import {
  Argon2PasswordHasher, loadArgon2Binding, NodeSessionTokens,
  newChallengeSecrets, hashChallengeCode, verifyChallengeCode, decideChallenge,
  type AuthChallengeRecord, type ChallengeStorePort,
} from "@jini-ai/user-management/server";
import type { PasswordHasherPort } from "@jini-ai/user-management";
import { renderMemberAuthMail } from "./auth-mail.js";

import { isMailDeliveryAvailable, mailSenderIdentityFor, type MailerSendOptions, type OutboundEmail } from "../../platform/mail/index.js";
import { OriginNotVerifiedError } from "@jini-ai/http-kit/verified-origin";
import {
  MemberAuthError,
  MemberSignInUnavailableError,
  MemberConflictError,
  MemberNotFoundError,
  MemberValidationError,
  type MagicLinkTokenRecord,
  type MemberRecord,
  type MemberSessionRecord,
  type MemberSubscriptionRecord,
  type MemberSubscriptionStatus,
} from "./types.js";
import type { MagicLinkTokenRepoPort, MemberSignInInput, MemberSignInResult, MembersWriteService, MembersWriteServiceDeps } from "./ports.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
/** Placeholder From for a non-delivering mailer; real providers get the site's configured sender. */
const MEMBERS_FALLBACK_SENDER = { email: "no-reply@members.local", name: "Members" } as const;

/**
 * No session lifetime is specified by ADR-030; 30 days is a reasonable default
 * "remember me" duration for a passwordless member portal (Ghost's own default is
 * comparable). Revisit if the ADR pins a value later.
 */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VALID_SUBSCRIPTION_STATUSES: readonly MemberSubscriptionStatus[] = [
  "active",
  "canceled",
  "expired",
  "comped",
];

const sessionTokens = new NodeSessionTokens({});
const legacyPasswordHasher = new Argon2PasswordHasher({ loadBinding: loadArgon2Binding });

/** Legacy compositions stay additive; new compositions inject the existing staff hasher. O(1). */
export function memberPasswordHasher({ deps }: { deps: MembersWriteServiceDeps }, _options = {}): PasswordHasherPort {
  return deps.passwordHasher ?? legacyPasswordHasher;
}

// Cache per adapter: tests and alternate hosts must never verify a hash made by another hasher.
const dummyHashes = new WeakMap<PasswordHasherPort, Promise<string>>();

/** One cached, unguessable dummy credential per hasher, so a miss costs the same verify as a hit. */
export function dummyPasswordHash({ hasher }: { hasher: PasswordHasherPort }, _options = {}): Promise<string> {
  let hash = dummyHashes.get(hasher);
  if (!hash) {
    hash = hasher.hash({ password: newRawToken() });
    dummyHashes.set(hasher, hash);
  }
  return hash;
}

/** High-entropy session/link digest; low-entropy codes use Jini's Argon2 helper instead. */
function hashToken(rawToken: string): string {
  return sessionTokens.hashToken({ rawToken });
}

function newRawToken(): string {
  return sessionTokens.newToken({});
}

function isoPlusMs(nowIso: string, ms: number): string {
  return new Date(new Date(nowIso).getTime() + ms).toISOString();
}

/** Normalize + validate an email address. Throws `MemberValidationError` on a bad format. */
function assertValidEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !EMAIL_PATTERN.test(normalized)) {
    throw new MemberValidationError(`'${email}' is not a valid email address`);
  }
  return normalized;
}

/**
 * Resolves or creates a pending member for operator creation or a consumed email challenge.
 * Public sign-in requests never call this owner: unverified addresses must not create accounts.
 * Returns null for a disabled/trashed address. Principal creation precedes the member save.
 * @complexity O(1) — one lookup and at most two saves.
 */
async function resolveOrCreateSignInMember(required: {
  deps: MembersWriteServiceDeps;
  workspaceId: string;
  email: string;
  nowIso: string;
}, optional: { name?: string; memberId?: string; creationSource?: "operator" | "verified_signup"; deferCreatedNotification?: boolean } = {}): Promise<{ member: MemberRecord | null; isNewMember: boolean }> {
  const { deps, workspaceId, email, nowIso } = required;
  const existing = await deps.members.findByEmail({ workspaceId, email });
  if (existing) {
    return { member: existing.status === "disabled" || existing.status === "trash" ? null : existing, isNewMember: false };
  }

  const member: MemberRecord = {
    id: optional.memberId ?? deps.ids.newId(),
    workspaceId,
    email,
    status: "pending",
    ...(optional.name !== undefined ? { name: optional.name } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
    version: 1,
  };
  // The member's principal row comes first, so a member row never exists without one. Its kind is
  // what makes `authorize()` deny every operator permission to this member (F3144); a principal
  // left behind by a failed member save is inert for the same reason. The display name is not the
  // email, so no second copy of the address lives outside the members tables.
  await deps.principals.save({
    id: member.id,
    workspaceId,
    kind: "member",
    displayName: "Site member",
    status: "active",
    createdAt: nowIso,
  });
  await deps.members.save(member);
  if (!optional.deferCreatedNotification) notifyMemberCreated({ deps, member, creationSource: optional.creationSource ?? "operator", initialState: "pending" });
  return { member, isNewMember: true };
}

/**
 * Creates an operator-requested pending member through the sign-up creation owner.
 * The principal remains kind member; no email verification, consent, token or session is granted.
 * @param required - Injected service ports and workspace-scoped email.
 * @param optional - Optional nonblank display name.
 * @returns The pending member, without a sign-in token or mail side effect.
 * @throws MemberValidationError for malformed input; MemberConflictError for an existing email.
 * @complexity O(1), two indexed email lookups and at most two saves.
 * @example createMember({ deps, input: { workspaceId: "ws", email: "ada@example.com" } }, { name: "Ada" })
 */
export async function createMember(required: {
  deps: MembersWriteServiceDeps;
  input: { workspaceId: string; email: string };
}, optional: { name?: string; deferCreatedNotification?: boolean } = {}): Promise<{ member: MemberRecord }> {
  const { deps, input } = required;
  const email = assertValidEmail(input.email);
  const name = optional.name?.trim();
  if (name !== undefined && !name) throw new MemberValidationError("name must not be blank when provided");
  const existing = await deps.members.findByEmail({ workspaceId: input.workspaceId, email });
  if (existing?.status === "trash") {
    throw new MemberConflictError(`member with email '${email}' is in Trash; restore it from the admin Trash screen`);
  }
  if (existing) {
    throw new MemberConflictError(`member with email '${email}' already exists`);
  }
  const { member } = await resolveOrCreateSignInMember({ deps, workspaceId: input.workspaceId, email, nowIso: clockNowIso({ clock: deps.clock }) }, { name, deferCreatedNotification: optional.deferCreatedNotification });
  if (!member) throw new MemberConflictError(`member with email '${email}' already exists`);
  return { member };
}

/**
 * Builds an absolute link from trusted origin evidence, never request headers.
 * Missing/unverified evidence refuses sign-in for every address before repository writes.
 * @throws MemberSignInUnavailableError when the site origin is not configured.
 * @complexity O(1) — one canonical-origin read.
 */
async function resolveSignInLinkPath(required: {
  deps: MembersWriteServiceDeps;
  workspaceId: string;
  relativePath: string;
}, _options: Record<string, never> = {}): Promise<string> {
  const { deps, workspaceId, relativePath } = required;
  if (!deps.origin) throw new MemberSignInUnavailableError("Member sign-in is unavailable: the site address is not set up.");
  try {
    const origin = await deps.origin.canonicalOrigin({ workspaceId });
    const portSuffix = origin.port ? `:${origin.port}` : "";
    const basePath = origin.basePath ?? "";
    return `${origin.scheme}://${origin.host}${portSuffix}${basePath}${relativePath}`;
  } catch (err) {
    if (!(err instanceof OriginNotVerifiedError)) throw err;
    throw new MemberSignInUnavailableError("Member sign-in is unavailable: the site address is not set up.");
  }
}

/**
 * Checks site-wide mail readiness before any address lookup. Sender resolution settles lazy
 * configuration first; transactional readiness is independent of the bulk lane.
 * @throws MemberSignInUnavailableError for an unconfigured/non-delivering transactional lane.
 * @complexity O(1) status read and capabilities check; no per-address I/O.
 */
async function requireSignInMail(required: { deps: MembersWriteServiceDeps }, _options: Record<string, never> = {}): Promise<void> {
  const { deps } = required;
  const status = await deps.mailStatus?.();
  const transactional = status?.lanes.find(lane => lane.lane === "transactional");
  if ((status && transactional?.state !== "ready") || !isMailDeliveryAvailable(deps.mailer)) {
    throw new MemberSignInUnavailableError("Member sign-in is unavailable: email is not set up for this site.");
  }
}

/**
 * Member-table adapter for Jini's challenge contract. Issuance supplies host identity metadata;
 * reads retain that metadata for deferred signup. Realm is implicit in this dedicated table.
 * @complexity O(1) indexed operations; repository CAS owns concurrent consumption/attempts.
 */
export function memberChallengeStore(required: {
  repo: MagicLinkTokenRepoPort;
  identity?: Pick<MagicLinkTokenRecord, "memberId" | "email" | "createdAt">;
}, _options = {}): ChallengeStorePort {
  const { repo, identity } = required;
  return {
    save: async record => {
      if (!identity || record.realm !== "member") throw new Error("Member challenge issuance requires member identity");
      await repo.save({ ...identity, id: record.id, workspaceId: record.workspaceId,
        purpose: record.purpose as MagicLinkTokenRecord["purpose"], tokenHash: record.tokenHash,
        codeHash: record.codeHash ?? undefined, failedAttempts: record.failedAttempts,
        expiresAt: record.expiresAt, consumedAt: record.consumedAt ?? undefined });
    },
    findById: async input => asChallenge(await repo.findById(input)),
    findByTokenHash: async input => asChallenge(await repo.findByTokenHash(input)),
    reserveCodeAttempt: input => repo.reserveCodeAttempt(input, { maxAttempts: input.maxAttempts }),
    consume: async input => {
      try {
        await repo.consume({ workspaceId: input.workspaceId, id: input.id, consumedAt: input.nowIso });
        return true;
      } catch (error) {
        // Only the repo's known single-use rejections are invalid credentials. Outages must surface.
        const prefix = `magic link token '${input.id}' `;
        if (error instanceof Error && ["was not found", "has expired", "was already consumed"]
          .some(reason => error.message === prefix + reason)) return false;
        throw error;
      }
    },
  };
}

/** Legacy link-only rows normalize to Jini's nullable code hash and zero spent attempts. */
function asChallenge(record: MagicLinkTokenRecord | null): AuthChallengeRecord | null {
  return record && { ...record, realm: "member", codeHash: record.codeHash ?? null, failedAttempts: record.failedAttempts ?? 0 };
}

/**
 * Only local absolute paths survive; controls/backslashes can change browser URL parsing, and an
 * encoded slash/backslash becomes `//host` if any later hop decodes the path before redirecting.
 */
function safeRedirectPath(path?: string): string | undefined {
  return path && /^\/(?!\/)/.test(path) && !/[\\\x00-\x1f\x7f]|%(2f|5c)/i.test(path) ? path : undefined;
}

/** Fragment-only secrets prevent accidental consumption and disclosure through GET request logs. */
function challengeLinkPath(required: {
  purpose: "signin" | "password_reset"; token: string; redirectPath?: string;
}, _options = {}): string {
  const { purpose, token, redirectPath } = required;
  if (purpose === "password_reset") return `/reset-password#token=${token}`;
  const redirect = safeRedirectPath(redirectPath);
  return `/signin#magic=${token}${redirect ? `&redirect=${encodeURIComponent(redirect)}` : ""}`;
}

/** Persist only challenge hashes and the deferred member identity; O(1) adapter calls. */
async function saveMemberChallenge(required: {
  deps: MembersWriteServiceDeps; member: MemberRecord | null; email: string;
  purpose: "signin" | "password_reset"; challengeId: string; nowIso: string; workspaceId: string;
  tokenHash: string; codeHash: string | null;
}, _options = {}): Promise<void> {
  const { deps, member, email, purpose, challengeId, nowIso, workspaceId, tokenHash, codeHash } = required;
  const store = memberChallengeStore({ repo: deps.magicLinks, identity: {
    memberId: member?.id ?? deps.ids.newId(), createdAt: nowIso, ...(member ? {} : { email }),
  } });
  await store.save({ id: challengeId, workspaceId, realm: "member", purpose,
    tokenHash, failedAttempts: 0, codeHash,
    expiresAt: isoPlusMs(nowIso, MAGIC_LINK_TTL_MS) });
}

/**
 * Issue sign-in or link-only reset through the same mail/readiness and challenge lifecycle.
 * Ineligible addresses receive a fresh, unstored handle; requests never create members.
 * Preparation checks site setup; deliver() owns all per-address work.
 * Secrets enter only the rendered send payload, never a profile, repo row or idempotency key.
 * @throws MemberSignInUnavailableError for site-wide setup; validation/adapter errors propagate.
 * @complexity O(1) reads/writes and one bounded password hash for sign-in codes.
 */
export async function prepareMemberChallenge(required: {
  deps: MembersWriteServiceDeps;
  input: { workspaceId: string; email: string; redirectPath?: string };
  purpose: "signin" | "password_reset";
}, _options = {}): Promise<{ challengeId: string; deliver: () => Promise<{ delivered: boolean; challengeId: string }> }> {
  const { deps, input, purpose } = required;
  const email = assertValidEmail(input.email);
  const nowIso = clockNowIso({ clock: deps.clock });
  // Resolved before the member lookup: a missing sender must fail the same way for every address,
  // so the error itself never tells a caller which emails are registered, and no token is minted
  // for a link that could not be sent.
  const from = await mailSenderIdentityFor({ mailer: deps.mailer }, { senderIdentity: deps.senderIdentity })
    .resolve({ workspaceId: input.workspaceId, fallback: MEMBERS_FALLBACK_SENDER });
  await requireSignInMail({ deps });
  const secrets = newChallengeSecrets({ tokens: sessionTokens, randomInt: ({ min, max }) => randomInt(min, max) });
  const relativePath = challengeLinkPath({ purpose, token: secrets.token, redirectPath: input.redirectPath });
  // ADR-040 owns origin evidence. Resolve before the address lookup so a setup error cannot
  // distinguish an existing/disabled address, and never store a token for a relative link.
  const link = await resolveSignInLinkPath({ deps, workspaceId: input.workspaceId, relativePath });
  const challengeId = deps.ids.newId();
  // Public HTTP can acknowledge setup now; every address-dependent effect stays in deliver().
  return { challengeId, deliver: async () => {
    // Hash before the lookup: ineligible addresses return early, and the Argon2 cost must not tell.
    const codeHash = purpose === "signin"
      ? await hashChallengeCode({ code: secrets.code, hasher: memberPasswordHasher({ deps }) }) : null;
    const member = await deps.members.findByEmail({ workspaceId: input.workspaceId, email });
    if (member?.status === "disabled" || member?.status === "trash") return { delivered: false, challengeId };
    if (purpose === "password_reset" && !member) return { delivered: false, challengeId };
    await saveMemberChallenge({ deps, member, email, purpose, challengeId, nowIso,
      tokenHash: secrets.tokenHash, codeHash, workspaceId: input.workspaceId });
    const message: OutboundEmail = { workspaceId: input.workspaceId, to: { email }, from,
      ...renderMemberAuthMail({ purpose, link, code: secrets.code }) };
    const sendOptions: MailerSendOptions = {
      // Reuse the sign_in activity/capture-redaction prefix for reset mail too.
      idempotencyKey: `members:signin:${purpose === "password_reset" ? "reset:" : ""}${secrets.tokenHash}`,
      workspaceId: input.workspaceId, sourceContext: { module: "members" }, purpose: "transactional",
      // Interactive auth mail proceeds without a durable outbox (SPEC-022 REQ-09).
      lane: "interactive",
    };
    const result = await deps.mailer.send(message, sendOptions);
    return { delivered: result.ok && !result.providerMessageId.startsWith("captured:"), challengeId };
  } };
}

/** Existing callers retain the awaited delivery contract; public HTTP uses the same prepared owner. */
export async function requestMemberChallenge(required: Parameters<typeof prepareMemberChallenge>[0], _options = {}): Promise<{ delivered: boolean; challengeId: string }> {
  const prepared = await prepareMemberChallenge(required);
  return prepared.deliver();
}

/** Request a link and six-digit code sharing one single-use challenge; O(1) adapter calls. */
async function requestSignInLink(required: {
  deps: MembersWriteServiceDeps;
  input: { workspaceId: string; email: string; redirectPath?: string };
}, _options = {}): Promise<{ delivered: boolean; challengeId: string }> {
  return requestMemberChallenge({ ...required, purpose: "signin" });
}

/**
 * Purpose-bound completion: reserve attempts before checking a code, then CAS-consume.
 * All invalid credentials (including lost races) give the same MemberAuthError.
 * @complexity O(1) indexed operations and at most one password verification.
 */
export async function consumeMemberChallenge(required: {
  deps: MembersWriteServiceDeps; input: MemberSignInInput; purpose: "signin" | "password_reset"; nowIso: string;
}, _options = {}): Promise<MagicLinkTokenRecord> {
  const { deps, input, purpose, nowIso } = required;
  const store = memberChallengeStore({ repo: deps.magicLinks });
  const scope = { workspaceId: input.workspaceId, realm: "member", purpose };
  const record = input.token !== undefined
    ? await store.findByTokenHash({ ...scope, tokenHash: hashToken(input.token) })
    : await store.findById({ ...scope, id: input.challengeId });
  const hasher = memberPasswordHasher({ deps });
  if (decideChallenge({ ...scope, record, nowIso }) !== "ok" || !record) {
    // Disabled/trashed addresses get unstored handles: spend the same verify so timing cannot tell.
    if (input.token === undefined) await verifyChallengeCode({ code: input.code, hash: await dummyPasswordHash({ hasher }), hasher });
    throw new MemberAuthError("sign-in credential is invalid");
  }
  if (input.token === undefined) {
    if (!await store.reserveCodeAttempt({ ...scope, id: record.id, nowIso })) throw new MemberAuthError("sign-in credential is invalid");
    if (!await verifyChallengeCode({ code: input.code, hash: record.codeHash, hasher })) throw new MemberAuthError("sign-in credential is invalid");
  }
  if (!await store.consume({ ...scope, id: record.id, nowIso })) throw new MemberAuthError("sign-in credential is invalid");
  // The host adapter preserves memberId/email/createdAt while normalizing challenge metadata.
  return record as AuthChallengeRecord & MagicLinkTokenRecord;
}

/**
 * Resolves legacy member-bound links or creates the account for a consumed new-address link.
 * Rechecking email handles two outstanding signup links and accounts created since issuance.
 * @throws MemberAuthError for an ineligible address or a lost legacy member.
 * @complexity O(1), one lookup and at most two saves through the existing creation owner.
 */
async function resolveConsumedSignInMember(required: {
  deps: MembersWriteServiceDeps; tokenRecord: MagicLinkTokenRecord; nowIso: string;
}, _options: Record<string, never> = {}): Promise<{ member: MemberRecord; isNewMember: boolean }> {
  const { deps, tokenRecord, nowIso } = required;
  if (tokenRecord.email !== undefined) {
    const resolved = await resolveOrCreateSignInMember({
      deps, workspaceId: tokenRecord.workspaceId, email: tokenRecord.email, nowIso,
    }, { memberId: tokenRecord.memberId, creationSource: "verified_signup" });
    if (!resolved.member) throw new MemberAuthError("sign-in credential is invalid");
    return { member: resolved.member, isNewMember: resolved.isNewMember };
  }
  const member = await deps.members.findById({ workspaceId: tokenRecord.workspaceId, id: tokenRecord.memberId });
  if (!member) throw new MemberAuthError("sign-in credential is invalid");
  return { member, isNewMember: false };
}

/**
 * Consume a link or code: create/resolve the member, verify email, promote to active,
 * and mint a member session. The raw bearer is returned only for setting the member cookie.
 *
 * @complexity O(1) — one token lookup/consume, one member read/write, one session write.
 * @overallScore 100
 */
async function completeSignIn(required: {
  deps: MembersWriteServiceDeps;
  input: MemberSignInInput;
}, _options: Record<string, never> = {}): Promise<MemberSignInResult> {
  const { deps, input } = required;
  const nowIso = clockNowIso({ clock: deps.clock });
  const tokenRecord = await consumeMemberChallenge({ deps, input, purpose: "signin", nowIso });

  const { member: existingMember, isNewMember } = await resolveConsumedSignInMember({ deps, tokenRecord, nowIso });
  if (existingMember.status === "disabled" || existingMember.status === "trash") {
    throw new MemberAuthError("sign-in credential is invalid");
  }
  // A link minted before Trash/restore (including a request racing credential revocation) must
  // not sign the restored account back in. Profile edits and other sign-ins keep links valid.
  if (existingMember.credentialsRevokedAt && existingMember.credentialsRevokedAt >= tokenRecord.createdAt) {
    throw new MemberAuthError("sign-in credential is invalid");
  }

  const member: MemberRecord = {
    ...existingMember,
    status: existingMember.status === "pending" ? "active" : existingMember.status,
    emailVerifiedAt: existingMember.emailVerifiedAt ?? nowIso,
    updatedAt: nowIso,
    version: existingMember.version + 1,
  };
  await deps.members.save(member);

  return { ...await issueMemberSession({ deps, member, nowIso }, { userAgent: input.userAgent, ip: input.ip }), isNewMember };
}

/**
 * The sole member session minter, reused by password, link and code sign-in.
 * Persists only the bearer digest and returns the raw token for the HTTP cookie adapter.
 * @complexity O(1), one session write.
 */
export async function issueMemberSession(required: {
  deps: MembersWriteServiceDeps; member: MemberRecord; nowIso: string;
}, options: { userAgent?: string; ip?: string } = {}): Promise<MemberSignInResult> {
  const { deps, member, nowIso } = required;
  const rawSessionToken = newRawToken();
  const session: MemberSessionRecord = {
    id: deps.ids.newId(),
    workspaceId: member.workspaceId,
    memberId: member.id,
    tokenHash: hashToken(rawSessionToken),
    createdAt: nowIso,
    expiresAt: isoPlusMs(nowIso, SESSION_TTL_MS),
    userAgent: options.userAgent,
    ip: options.ip,
  };
  await deps.sessions.save(session);

  return { member, session, rawSessionToken };
}

/**
 * Operator/self profile update (validated, revision-recorded via `save`).
 * @complexity O(1).
 * @overallScore 100
 */
async function updateProfile(required: {
  deps: MembersWriteServiceDeps;
  input: { workspaceId: string; memberId: string; name?: string; note?: string };
}): Promise<{ member: MemberRecord }> {
  const { deps, input } = required;
  const existing = await deps.members.findById({ workspaceId: input.workspaceId, id: input.memberId });
  if (!existing) {
    throw new MemberNotFoundError(`member '${input.memberId}' was not found`);
  }

  let name = existing.name;
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw new MemberValidationError("name must not be blank when provided");
    }
    name = trimmed;
  }

  const note = input.note !== undefined ? input.note.trim() : existing.note;

  const member: MemberRecord = {
    ...existing,
    name,
    note,
    updatedAt: clockNowIso({ clock: deps.clock }),
    version: existing.version + 1,
  };
  await deps.members.save(member);

  return { member };
}

/**
 * Operator: disable a member (ADR-021 §5 disable-only, never hard-delete).
 * Idempotent — disabling an already-disabled member is a no-op, not an error.
 * Also revokes every live session for the member so a disabled account cannot
 * keep reading gated content through a session minted before the disable.
 *
 * @complexity O(s), s = the member's live session count (small, per-member).
 * @overallScore 100
 */
async function disableMember(required: {
  deps: MembersWriteServiceDeps;
  input: { workspaceId: string; memberId: string };
}): Promise<{ member: MemberRecord }> {
  const { deps, input } = required;
  const existing = await deps.members.findById({ workspaceId: input.workspaceId, id: input.memberId });
  if (!existing) {
    throw new MemberNotFoundError(`member '${input.memberId}' was not found`);
  }

  if (existing.status === "disabled") {
    return { member: existing };
  }

  const nowIso = clockNowIso({ clock: deps.clock });
  const member: MemberRecord = {
    ...existing,
    status: "disabled",
    credentialsRevokedAt: nowIso,
    updatedAt: nowIso,
    version: existing.version + 1,
  };
  await deps.members.save(member);
  await deps.sessions.revokeAllForMember({
    workspaceId: input.workspaceId,
    memberId: input.memberId,
    revokedAt: nowIso,
  });

  return { member };
}

/**
 * Operator: grant a comp subscription. Rejects an archived tier and rejects a
 * duplicate active/comped subscription to the same tier (aggregate invariant:
 * a member cannot hold two simultaneous entitlements to one tier).
 *
 * @complexity O(k), k = the member's active-subscription count (duplicate check).
 * @overallScore 100
 */
async function compSubscription(required: {
  deps: MembersWriteServiceDeps;
  input: { workspaceId: string; memberId: string; tierId: string };
}): Promise<{ subscription: MemberSubscriptionRecord }> {
  const { deps, input } = required;
  const member = await deps.members.findById({ workspaceId: input.workspaceId, id: input.memberId });
  if (!member) {
    throw new MemberNotFoundError(`member '${input.memberId}' was not found`);
  }

  const tier = await deps.tiers.findById({ workspaceId: input.workspaceId, id: input.tierId });
  if (!tier) {
    throw new MemberNotFoundError(`tier '${input.tierId}' was not found`);
  }
  if (tier.status !== "active") {
    throw new MemberValidationError(`tier '${input.tierId}' is archived and cannot accept new subscriptions`);
  }

  const nowIso = clockNowIso({ clock: deps.clock });
  const activeSubscriptions = await deps.subscriptions.listActiveByMember({
    workspaceId: input.workspaceId,
    memberId: input.memberId,
    nowIso,
  });
  if (activeSubscriptions.some((subscription) => subscription.tierId === input.tierId)) {
    throw new MemberConflictError(
      `member '${input.memberId}' already has an active subscription to tier '${input.tierId}'`
    );
  }

  const subscription: MemberSubscriptionRecord = {
    id: deps.ids.newId(),
    workspaceId: input.workspaceId,
    memberId: input.memberId,
    tierId: input.tierId,
    status: "comped",
    source: "comp",
    startedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    version: 1,
  };
  await deps.subscriptions.save(subscription);

  return { subscription };
}

/**
 * Change a subscription's status (cancel/expire; also the entry point a future
 * billing plugin uses for `source='billing'` rows — ADR-030 §6).
 *
 * @complexity O(1).
 * @overallScore 100
 */
async function setSubscriptionStatus(required: {
  deps: MembersWriteServiceDeps;
  input: {
    workspaceId: string;
    subscriptionId: string;
    status: MemberSubscriptionStatus;
    externalRef?: string;
  };
}): Promise<{ subscription: MemberSubscriptionRecord }> {
  const { deps, input } = required;
  const existing = await deps.subscriptions.findById({
    workspaceId: input.workspaceId,
    id: input.subscriptionId,
  });
  if (!existing) {
    throw new MemberNotFoundError(`subscription '${input.subscriptionId}' was not found`);
  }
  if (!VALID_SUBSCRIPTION_STATUSES.includes(input.status)) {
    throw new MemberValidationError(`'${input.status}' is not a valid subscription status`);
  }

  const nowIso = clockNowIso({ clock: deps.clock });
  const subscription: MemberSubscriptionRecord = {
    ...existing,
    status: input.status,
    externalRef: input.externalRef ?? existing.externalRef,
    canceledAt: input.status === "canceled" ? nowIso : existing.canceledAt,
    updatedAt: nowIso,
    version: existing.version + 1,
  };
  await deps.subscriptions.save(subscription);

  return { subscription };
}

/**
 * The `MembersWriteService` implementation, grouped into the port shape.
 */
export const membersWriteService: MembersWriteService = {
  requestSignInLink,
  completeSignIn,
  updateProfile,
  disableMember,
  compSubscription,
  setSubscriptionStatus,
};

export {
  requestSignInLink,
  completeSignIn,
  updateProfile,
  disableMember,
  compSubscription,
  setSubscriptionStatus,
};

/** Notify only an actually written member. Observers cannot change durable identity or auth outcomes.
 * @complexity O(1). */
export function notifyMemberCreated(
  { deps, member, creationSource, initialState }: { deps: MembersWriteServiceDeps; member: MemberRecord;
    creationSource: "operator" | "verified_signup" | "oidc_signup"; initialState: "pending" | "active" },
  _optional: Record<string, never> = {},
): void {
  try { deps.onMemberCreated?.({ workspaceId: member.workspaceId, memberId: member.id, creationSource, initialState }); }
  catch { /* Optional product analytics cannot alter a committed member. */ }
}
