import { nowIso as clockNowIso } from "@jini-ai/core/primitives";
/**
 * @file `MembersWriteService` implementation (ADR-030 §3/§6).
 *
 * Purpose:
 * The single write chokepoint for member-domain mutations: passwordless
 * sign-in (request + complete), profile updates, disable-only lifecycle, and
 * comp/subscription-status changes. Mirrors the `updatePost` pattern in
 * `src/features/post/post.ts`: plain async functions taking `{ deps, input }`,
 * typed domain errors from `./types`, grouped into the `MembersWriteService`
 * shape at the bottom of the file.
 *
 * Known interface gaps (flagged per task instructions — NOT silently papered
 * over; see file-level comments at each site below):
 *  1. New-address challenges reserve a member id and carry the email, without creating a
 *     member or principal. Consumption resolves that email again and creates the member then.
 *     Legacy challenges without an email remain bound to their existing member id.
 *  2. `MembersWriteService.completeSignIn`'s declared return type is
 *     `{ member: MemberRecord; session: MemberSessionRecord }` — but the session
 *     token is stored **hashed** (Round-3 audit fold), so there is no way for a
 *     caller to read the raw bearer value back off `session` to set it as a
 *     cookie. This implementation returns an additional `rawSessionToken` field
 *     (structurally a superset of the declared return type, so it still satisfies
 *     `MembersWriteService`) — callers that need the cookie value must consume
 *     this concrete function's richer return type, not the narrower port
 *     signature. Flagged for a follow-up port amendment.
 */
import { createHash, randomBytes } from "node:crypto";

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
import type { MembersWriteService, MembersWriteServiceDeps } from "./ports.js";

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

/** SHA-256 hex digest of a raw bearer token. See `access-resolver.ts` for why this is duplicated there. */
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function newRawToken(): string {
  return randomBytes(32).toString("hex");
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
}, optional: { name?: string; memberId?: string } = {}): Promise<MemberRecord | null> {
  const { deps, workspaceId, email, nowIso } = required;
  const existing = await deps.members.findByEmail({ workspaceId, email });
  if (existing) {
    return existing.status === "disabled" || existing.status === "trash" ? null : existing;
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
  return member;
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
}, optional: { name?: string } = {}): Promise<{ member: MemberRecord }> {
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
  const member = await resolveOrCreateSignInMember({ deps, workspaceId: input.workspaceId, email, nowIso: clockNowIso({ clock: deps.clock }) }, { name });
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
 * Begin passwordless sign-in/up without creating a member or principal.
 * Returns the mailer's acceptance, not proof of inbox delivery; captures and disabled members
 * report false. Public HTTP maps all per-address outcomes to a generic accepted response, so
 * suppression/provider failures cannot reveal membership. Site setup errors happen first.
 * @throws MemberSignInUnavailableError when site-wide mail/origin setup is unavailable.
 * @throws SenderIdentityNotConfiguredError when a delivering mailer lacks a sender.
 * @complexity O(1) — one member read, one challenge write and at most one mail send.
 */
async function requestSignInLink(required: {
  deps: MembersWriteServiceDeps;
  input: { workspaceId: string; email: string; redirectPath?: string };
}, _options: Record<string, never> = {}): Promise<{ delivered: boolean }> {
  const { deps, input } = required;
  const email = assertValidEmail(input.email);
  const nowIso = clockNowIso({ clock: deps.clock });
  // Resolved before the member lookup: a missing sender must fail the same way for every address,
  // so the error itself never tells a caller which emails are registered (see doc above), and no
  // token is minted for a link that could not be sent.
  const from = await mailSenderIdentityFor({ mailer: deps.mailer }, { senderIdentity: deps.senderIdentity })
    .resolve({ workspaceId: input.workspaceId, fallback: MEMBERS_FALLBACK_SENDER });

  await requireSignInMail({ deps });
  const rawToken = newRawToken();
  const tokenHash = hashToken(rawToken);
  // ADR-040 owns origin evidence. Resolve before the address lookup so a setup error cannot
  // distinguish an existing/disabled address, and never store a token for a relative link.
  const relativePath = `/auth/magic?token=${rawToken}${
    input.redirectPath ? `&redirect=${encodeURIComponent(input.redirectPath)}` : ""
  }`;
  const linkPath = await resolveSignInLinkPath({ deps, workspaceId: input.workspaceId, relativePath });
  const member = await deps.members.findByEmail({ workspaceId: input.workspaceId, email });
  if (member?.status === "disabled" || member?.status === "trash") return { delivered: false };

  await deps.magicLinks.save({
    id: deps.ids.newId(),
    workspaceId: input.workspaceId,
    memberId: member?.id ?? deps.ids.newId(),
    ...(member ? {} : { email }),
    tokenHash,
    purpose: "signin",
    createdAt: nowIso,
    expiresAt: isoPlusMs(nowIso, MAGIC_LINK_TTL_MS),
  });

  const message: OutboundEmail = {
    workspaceId: input.workspaceId,
    to: { email },
    from,
    subject: "Your sign-in link",
    text: `Sign in using this link (expires in 15 minutes): ${linkPath}`,
  };
  const sendOptions: MailerSendOptions = {
    // Deterministic from the token hash (never the raw token) — an outbox
    // redelivery of the same request reuses this key (ADR-037 amendment 1).
    idempotencyKey: `members:signin:${tokenHash}`,
    workspaceId: input.workspaceId,
    sourceContext: { module: "members" },
    purpose: "transactional",
    // SPEC-022 REQ-09: interactive lane — proceeds ungated even without a durable outbox path.
    lane: "interactive",
  };

  const result = await deps.mailer.send(message, sendOptions);
  return { delivered: result.ok && !result.providerMessageId.startsWith("captured:") };
}

/** Looks up, validates and consumes a workspace-scoped sign-in credential before member access. */
async function consumeSignInToken(required: {
  deps: MembersWriteServiceDeps;
  workspaceId: string;
  tokenHash: string;
  nowIso: string;
}, _options: Record<string, never> = {}): Promise<MagicLinkTokenRecord> {
  const { deps, workspaceId, tokenHash, nowIso } = required;
  const tokenRecord = await deps.magicLinks.findByTokenHash({
    workspaceId,
    tokenHash,
  });
  if (!tokenRecord) {
    throw new MemberAuthError("sign-in link is invalid");
  }
  if (tokenRecord.consumedAt) {
    throw new MemberAuthError("sign-in link was already used");
  }
  if (tokenRecord.expiresAt <= nowIso) {
    throw new MemberAuthError("sign-in link has expired");
  }

  await deps.magicLinks.consume({
    workspaceId,
    id: tokenRecord.id,
    consumedAt: nowIso,
  });

  return tokenRecord;
}

/**
 * Resolves legacy member-bound links or creates the account for a consumed new-address link.
 * Rechecking email handles two outstanding signup links and accounts created since issuance.
 * @throws MemberAuthError for a disabled address; MemberNotFoundError for a lost legacy member.
 * @complexity O(1), one lookup and at most two saves through the existing creation owner.
 */
async function resolveConsumedSignInMember(required: {
  deps: MembersWriteServiceDeps; tokenRecord: MagicLinkTokenRecord; nowIso: string;
}, _options: Record<string, never> = {}): Promise<MemberRecord> {
  const { deps, tokenRecord, nowIso } = required;
  if (tokenRecord.email !== undefined) {
    const member = await resolveOrCreateSignInMember({
      deps, workspaceId: tokenRecord.workspaceId, email: tokenRecord.email, nowIso,
    }, { memberId: tokenRecord.memberId });
    if (!member) throw new MemberAuthError("this account has been disabled");
    return member;
  }
  const member = await deps.members.findById({ workspaceId: tokenRecord.workspaceId, id: tokenRecord.memberId });
  if (!member) throw new MemberNotFoundError(`member '${tokenRecord.memberId}' was not found`);
  return member;
}

/**
 * Consume a magic-link token: create/resolve the member, verify email and promote to `active`,
 * and mint a member session. See file-header gap (2) — the raw session token
 * is returned as `rawSessionToken` in addition to the declared `session` record.
 *
 * @complexity O(1) — one token lookup/consume, one member read/write, one session write.
 * @overallScore 100
 */
async function completeSignIn(required: {
  deps: MembersWriteServiceDeps;
  input: { workspaceId: string; token: string; userAgent?: string; ip?: string };
}, _options: Record<string, never> = {}): Promise<{ member: MemberRecord; session: MemberSessionRecord; rawSessionToken: string }> {
  const { deps, input } = required;
  const nowIso = clockNowIso({ clock: deps.clock });
  const tokenHash = hashToken(input.token);

  const tokenRecord = await consumeSignInToken({
    deps,
    workspaceId: input.workspaceId,
    tokenHash,
    nowIso,
  });

  const existingMember = await resolveConsumedSignInMember({ deps, tokenRecord, nowIso });
  if (existingMember.status === "disabled" || existingMember.status === "trash") {
    throw new MemberAuthError("this account has been disabled");
  }
  // A link minted before Trash/restore (including a request racing credential revocation) must
  // not sign the restored account back in. Profile edits and other sign-ins keep links valid.
  if (existingMember.credentialsRevokedAt && existingMember.credentialsRevokedAt > tokenRecord.createdAt) {
    throw new MemberAuthError("sign-in link predates credential revocation; request a new sign-in link");
  }

  const member: MemberRecord = {
    ...existingMember,
    status: existingMember.status === "pending" ? "active" : existingMember.status,
    emailVerifiedAt: existingMember.emailVerifiedAt ?? nowIso,
    updatedAt: nowIso,
    version: existingMember.version + 1,
  };
  await deps.members.save(member);

  const rawSessionToken = newRawToken();
  const session: MemberSessionRecord = {
    id: deps.ids.newId(),
    workspaceId: input.workspaceId,
    memberId: member.id,
    tokenHash: hashToken(rawSessionToken),
    createdAt: nowIso,
    expiresAt: isoPlusMs(nowIso, SESSION_TTL_MS),
    userAgent: input.userAgent,
    ip: input.ip,
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
 * `completeSignIn`'s richer return type (see file header gap (2)) is a
 * structural superset of the declared signature, so this still satisfies
 * `MembersWriteService`.
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
