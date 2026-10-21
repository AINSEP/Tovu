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
 *  1. `MagicLinkTokenRecord.memberId` is a non-optional composite FK, but ADR-030's
 *     Round-2 fold flags an unresolved contradiction with "upsert member on first
 *     use" (a brand-new signup has no member row yet when the link is requested).
 *     Resolution taken here: `requestSignInLink` eagerly creates a `pending`
 *     `MemberRecord` (if none exists for the email) so the token always has a
 *     valid `memberId`; `completeSignIn` then promotes `pending -> active` and
 *     sets `emailVerifiedAt` rather than literally creating the row. This satisfies
 *     the port as written without touching `types.ts`/`ports.ts`.
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

import { mailSenderIdentityFor, type MailerSendOptions, type OutboundEmail } from "../../platform/mail/index.js";
import { OriginNotVerifiedError } from "@jini-ai/http-kit/verified-origin";
import {
  MemberAuthError,
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
 * Resolves the member a sign-in request is for: the existing row, or a freshly-created `pending`
 * one when none exists (see file-header gap (1): pre-creates so the magic-link token's required
 * `memberId` FK is always valid at creation time). Returns `null` for a disabled member — the
 * caller's signal to skip issuing a token/mail while still returning the constant
 * `{ delivered: true }` response (see {@link requestSignInLink}'s own doc).
 *
 * @complexity O(1) — one lookup, at most two saves (the member principal, then the member).
 */
async function resolveOrCreateSignInMember(required: {
  deps: MembersWriteServiceDeps;
  workspaceId: string;
  email: string;
  nowIso: string;
}, optional: { name?: string } = {}): Promise<MemberRecord | null> {
  const { deps, workspaceId, email, nowIso } = required;
  const existing = await deps.members.findByEmail({ workspaceId, email });
  if (existing) {
    return existing.status === "disabled" || existing.status === "trash" ? null : existing;
  }

  const member: MemberRecord = {
    id: deps.ids.newId(),
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
 * Resolves the absolute sign-in link path via the verified origin (ADR-PIPE-013 Decision §3),
 * falling back to `relativePath` on any unverified-origin failure — INV-06: a missing/unverified
 * origin must never fail the call or change the caller-facing response, only degrade the link's
 * shape. The gap is surfaced only as an observability signal (workspaceId only — never the email or
 * raw token, both out of scope for this function).
 *
 * @complexity O(1) — at most one `canonicalOrigin` call.
 */
async function resolveSignInLinkPath(required: {
  deps: MembersWriteServiceDeps;
  workspaceId: string;
  relativePath: string;
}): Promise<string> {
  const { deps, workspaceId, relativePath } = required;
  if (!deps.origin) return relativePath;

  try {
    const origin = await deps.origin.canonicalOrigin({ workspaceId });
    const portSuffix = origin.port ? `:${origin.port}` : "";
    const basePath = origin.basePath ?? "";
    return `${origin.scheme}://${origin.host}${portSuffix}${basePath}${relativePath}`;
  } catch (err) {
    if (!(err instanceof OriginNotVerifiedError)) throw err;
    console.warn(
      `[members] requestSignInLink: no verified origin for workspaceId=${workspaceId}, falling back to a relative sign-in link`
    );
    return relativePath;
  }
}

/**
 * Begin passwordless sign-in/up: mint a hashed, short-TTL magic-link token and
 * mail the raw token embedded in a link. Always resolves `{ delivered: true }`
 * regardless of whether the email is registered, already disabled, or the
 * mailer accepts the send — a constant response is the anti-enumeration
 * mitigation ADR-030 OQ-8 flags as a launch-gate precondition; a distinguishable
 * response (error vs success) would let a caller probe which emails exist.
 *
 * @throws SenderIdentityNotConfiguredError When a delivering mailer is active and the site has no
 *   sender configured — for every address alike, before any member or token is written.
 * @complexity O(1) — single member lookup/create + one token write + one mail send.
 * @overallScore 100
 */
async function requestSignInLink(required: {
  deps: MembersWriteServiceDeps;
  input: { workspaceId: string; email: string; redirectPath?: string };
}): Promise<{ delivered: true }> {
  const { deps, input } = required;
  const email = assertValidEmail(input.email);
  const nowIso = clockNowIso({ clock: deps.clock });
  // Resolved before the member lookup: a missing sender must fail the same way for every address,
  // so the error itself never tells a caller which emails are registered (see doc above), and no
  // token is minted for a link that could not be sent.
  const from = await mailSenderIdentityFor({ mailer: deps.mailer }, { senderIdentity: deps.senderIdentity })
    .resolve({ workspaceId: input.workspaceId, fallback: MEMBERS_FALLBACK_SENDER });

  const member = await resolveOrCreateSignInMember({ deps, workspaceId: input.workspaceId, email, nowIso });
  if (!member) {
    // Disabled members cannot sign in; still return the constant `{ delivered: true }`
    // response (see doc above) and skip issuing a token / sending mail.
    return { delivered: true };
  }

  const rawToken = newRawToken();
  const tokenHash = hashToken(rawToken);

  await deps.magicLinks.save({
    id: deps.ids.newId(),
    workspaceId: input.workspaceId,
    memberId: member.id,
    tokenHash,
    purpose: "signin",
    createdAt: nowIso,
    expiresAt: isoPlusMs(nowIso, MAGIC_LINK_TTL_MS),
  });

  // ADR-PIPE-013 Decision §3: `core/origin` (ADR-040) now exists and is the
  // trusted seam for absolute magic-link URLs — the stale "no core/origin
  // port exists yet" note this file used to carry is corrected here. `origin`
  // is an optional dep (see `ports.ts`'s doc): no composition root wires a
  // real instance in yet, so an absent dep is treated identically to
  // `OriginNotVerifiedError` (silent relative-path fallback, no warning log —
  // that's a repo-wiring gap, not an operator misconfiguration to flag). See
  // `resolveSignInLinkPath` for the fallback logic itself.
  const relativePath = `/auth/magic?token=${rawToken}${
    input.redirectPath ? `&redirect=${encodeURIComponent(input.redirectPath)}` : ""
  }`;
  const linkPath = await resolveSignInLinkPath({ deps, workspaceId: input.workspaceId, relativePath });

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

  // Result intentionally unobserved by the caller-facing response (see doc
  // above); a provider failure should surface via observability/alerting, not
  // by changing this synchronous, constant-shaped return.
  await deps.mailer.send(message, sendOptions);

  return { delivered: true };
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
 * Consume a magic-link token: verify email, promote the member to `active`,
 * and mint a member session. See file-header gap (2) — the raw session token
 * is returned as `rawSessionToken` in addition to the declared `session` record.
 *
 * @complexity O(1) — one token lookup/consume, one member read/write, one session write.
 * @overallScore 100
 */
async function completeSignIn(required: {
  deps: MembersWriteServiceDeps;
  input: { workspaceId: string; token: string; userAgent?: string; ip?: string };
}): Promise<{ member: MemberRecord; session: MemberSessionRecord; rawSessionToken: string }> {
  const { deps, input } = required;
  const nowIso = clockNowIso({ clock: deps.clock });
  const tokenHash = hashToken(input.token);

  const tokenRecord = await consumeSignInToken({
    deps,
    workspaceId: input.workspaceId,
    tokenHash,
    nowIso,
  });

  const existingMember = await deps.members.findById({
    workspaceId: input.workspaceId,
    id: tokenRecord.memberId,
  });
  if (!existingMember) {
    // Should not happen given `requestSignInLink` always pre-creates the member
    // (gap (1) above) — defensive, not a validation outcome.
    throw new MemberNotFoundError(`member '${tokenRecord.memberId}' was not found`);
  }
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
