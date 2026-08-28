/**
 * @file Core domain types for the `members` Tier-2 core library (ADR-030).
 *
 * Purpose:
 * Type-only definitions for front-end membership: member accounts (a distinct
 * principal kind from admin operators — ADR-021), tiers/subscriptions, gated
 * content access, and member sign-in sessions kept isolated from the admin
 * session (ADR-020/021/025).
 *
 * Architectural role:
 * These are the row/domain shapes the `members` library owns. They mirror the
 * `features/*` conventions (records + workspace-scoped ports in ADR-030's
 * `ports.ts`). No feature logic lives here — interfaces and types only.
 *
 * Scope note (ADR-030 §Trust boundary):
 * A `member` is an authenticated NON-operator principal governed by the
 * *entitlement* axis (tier membership), never by the operator RBAC axis
 * (ADR-021 §1). Nothing in this file grants a member an operator permission.
 */
import type { ISODateTime, JsonObject, UUID } from "@jini-ai/cms/core";

/**
 * Principal kind for a front-end member. Distinct from ADR-021's
 * `user | agent | api_key | system`; a member never holds operator RBAC roles.
 * (Extending the ADR-021 `principals.kind` enum is an OPEN QUESTION — ADR-030.)
 */
export type MemberPrincipalKind = "member";

/**
 * Member account lifecycle. Disable-only, never hard-deleted, because a member
 * is an ADR-021 principal and `change_set.actorId` / revision history must not
 * dangle (ADR-021 §5). `pending` = created but email not yet verified.
 */
export type MemberStatus = "pending" | "active" | "disabled";

/**
 * Front-end member account. `id` is the member's principal id (ULID); the row
 * is the member's profile, analogous to ADR-021's `users` table for operators.
 */
export interface MemberRecord {
  /** Principal id (ULID). Root of identity + audit; disable-only (ADR-021 §5). */
  id: UUID;
  /** Workspace boundary — carried on every scoped row (ADR-007). */
  workspaceId: UUID;
  /** Primary sign-in identifier; unique per workspace (case-folded on write). */
  email: string;
  /** Optional display name. */
  name?: string;
  /** Set once the email is verified (magic-link click or explicit verify). */
  emailVerifiedAt?: ISODateTime;
  /** Lifecycle state (disable-only). */
  status: MemberStatus;
  /** Operator-only private note (never exposed on the member origin). */
  note?: string;
  /** Namespaced, validated extension bag (`ext.{owner}.*`), per ADR-022 §2. */
  fields?: JsonObject;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Monotonic optimistic-concurrency version (ADR-022 §4c). */
  version: number;
}

/** Whether a tier is free or paid. Billing itself is deferred (ADR-030 §6). */
export type MemberTierType = "free" | "paid";

/** Tier lifecycle. Archived tiers stop accepting new subscriptions. */
export type MemberTierStatus = "active" | "archived";

/**
 * A membership tier (Ghost's "tier"). Registry-as-data, mirroring ADR-022
 * content-types / ADR-028 setting-definitions / ADR-027 transform-registry.
 * Price columns are nullable seams: no billing engine ships in v1 (ADR-030 §6).
 */
export interface MemberTierRecord {
  id: UUID;
  workspaceId: UUID;
  name: string;
  /** URL/identifier slug, unique per workspace. */
  slug: string;
  type: MemberTierType;
  status: MemberTierStatus;
  description?: string;
  /** Optional post-signup welcome page path on the public origin. */
  welcomePagePath?: string;
  /** Whether the tier is offered in the public portal (vs comp-only). */
  visibleInPortal: boolean;
  /** Deferred billing seams — populated only by a future billing plugin. */
  monthlyPriceCents?: number;
  yearlyPriceCents?: number;
  /** ISO-4217 code (e.g. "usd"); null until a paid tier is priced. */
  currency?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  version: number;
}

/** Subscription lifecycle state; drives entitlement resolution. */
export type MemberSubscriptionStatus = "active" | "canceled" | "expired" | "comped";

/**
 * How a subscription came to exist. `billing` rows are written by a future
 * tier-3 billing plugin through the core chokepoint (ADR-030 §6); v1 core mints
 * `signup` (free) and `comped` (operator-granted) rows only.
 */
export type MemberSubscriptionSource = "signup" | "comp" | "billing";

/**
 * A member's entitlement to a tier. The join carries its own `workspaceId` so
 * the composite `(workspace_id, id)` FKs of ADR-021 §4 are buildable.
 */
export interface MemberSubscriptionRecord {
  id: UUID;
  workspaceId: UUID;
  /** Composite FK → members(workspace_id, id). */
  memberId: UUID;
  /** Composite FK → member_tiers(workspace_id, id). */
  tierId: UUID;
  status: MemberSubscriptionStatus;
  source: MemberSubscriptionSource;
  /** Opaque provider reference (e.g. Stripe subscription id); billing-only. */
  externalRef?: string;
  startedAt: ISODateTime;
  /** For paid/timeboxed entitlements; absent for open-ended free membership. */
  currentPeriodEnd?: ISODateTime;
  canceledAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  version: number;
}

/**
 * A member sign-in session. DELIBERATELY a separate table + cookie + origin
 * from the operator `sessions` of ADR-021 §7 — a member session must never be
 * replayable against an admin route (ADR-030 §3, ADR-020/025 origin isolation).
 */
export interface MemberSessionRecord {
  id: UUID;
  workspaceId: UUID;
  /** Composite FK → members(workspace_id, id). */
  memberId: UUID;
  /** Argon2id/HMAC hash of the session token; the raw token never persists. */
  tokenHash: string;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  /** Server-side revocation (ADR-021 §7 revocable sessions). */
  revokedAt?: ISODateTime;
  lastSeenAt?: ISODateTime;
  userAgent?: string;
  ip?: string;
}

/**
 * A single-use, short-TTL magic-link credential (Ghost's passwordless sign-in).
 * Stored hashed; consumed exactly once, then tombstoned.
 */
export interface MagicLinkTokenRecord {
  id: UUID;
  workspaceId: UUID;
  /** Composite FK → members(workspace_id, id). */
  memberId: UUID;
  tokenHash: string;
  /** What the click authorizes — first sign-in also verifies the email. */
  purpose: "signin" | "signup" | "email_change";
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  consumedAt?: ISODateTime;
}

/**
 * Content visibility levels stored on an entry at `fields.ext.members.access`
 * (ADR-022 §2 namespaced ext field — no new content table). Mirrors Ghost's
 * public / members / paid / specific-tiers model.
 */
export type MemberContentVisibility = "public" | "members" | "paid" | "tiers";

/** The validated ext-field shape written onto a gated entry. */
export interface MemberContentAccess {
  visibility: MemberContentVisibility;
  /** Required when `visibility === "tiers"`: the entitled tier ids. */
  tierIds?: UUID[];
}

/**
 * The resolved membership context for one front-end request. Anonymous callers
 * get `{ isAuthenticated: false, activeTierIds: [] }`. Derived from a validated
 * member session (never from a client-supplied claim).
 */
export interface MemberContext {
  isAuthenticated: boolean;
  memberId?: UUID;
  /** Tier ids the member currently has an active/comped subscription to. */
  activeTierIds: UUID[];
  /** True if any active tier is a paid tier. */
  isPaid: boolean;
}

/**
 * Outcome of the core content-access decision. This is an ENTITLEMENT decision
 * (tier membership axis), evaluated by the `members` library at the read
 * chokepoint — NOT the ADR-021 operator RBAC `authorize()` (ADR-030 §4).
 */
export interface MemberAccessDecision {
  allowed: boolean;
  /** The entry's declared visibility that produced this decision. */
  visibility: MemberContentVisibility;
  /** Machine-readable reason, e.g. "public", "entitled", "upgrade_required". */
  reason: string;
  /**
   * When `allowed === false`, whether a truncated teaser/paywall may still be
   * rendered (Ghost's "public preview") rather than a hard 404.
   */
  teaser: boolean;
}

/** Raised when a member sign-in credential is invalid, expired, or consumed. */
export class MemberAuthError extends Error {}
/** Raised when a member profile/tier/subscription payload fails validation. */
export class MemberValidationError extends Error {}
/** Raised on a unique-constraint clash (e.g. duplicate email or tier slug). */
export class MemberConflictError extends Error {}
/** Raised when a member, tier, or subscription is not found in the workspace. */
export class MemberNotFoundError extends Error {}

/**
 * D1c consent — Members-owned, purpose-keyed consent records (ADR-PIPE-013
 * Decision §4, crosscutting-sweep D1c LOCKED 4-0).
 *
 * Purpose is a module-prefixed string (e.g. `"marketing-email"`,
 * `"newsletter:{listId}"`, `"feature:{ns}:{id}"`) rather than a closed union —
 * new modules mint their own namespaced purposes without touching this file
 * (Article III: no speculative enum, just a documented string convention).
 */
export type ConsentPurpose = string;

/** Consent lifecycle. Only `confirmConsent` may produce `'granted'` (INV-NEW-02) — see `consent-service.ts`. */
export type ConsentStatus = "pending" | "granted" | "revoked";

/** Evidence captured alongside a consent state change (never the raw consent-text body — a reference/hash only). */
export interface ConsentEvidence {
  /** Reference to the consent copy shown (e.g. a CMS entry id), not the text itself. */
  consentTextRef?: string;
  /** Hash of the consent copy shown, for tamper-evidence without storing the body. */
  consentTextHash?: string;
  /** Where the request/confirmation originated, e.g. `"newsletter-signup-form"`. */
  source: string;
  /** The magic/confirm-token id that authorized a `confirmConsent` call, when applicable. */
  confirmTokenId?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * A member's consent record for one `(memberId, purpose)` pair. Reaches
 * `status: 'granted'` ONLY via `requestConsent` then `confirmConsent` in
 * sequence (INV-NEW-02) — no caller may assert `granted` directly.
 */
export interface MemberConsentRecord {
  id: UUID;
  workspaceId: UUID;
  /** Composite FK → members(workspace_id, id). */
  memberId: UUID;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  evidence: ConsentEvidence;
  grantedAt?: ISODateTime;
  revokedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  version: number;
}

/** A consent state-change op recorded on the shared `member_revisions` ledger (`entity_kind='consent'`). */
export type ConsentRevisionOp = "consent_request" | "consent_confirm" | "consent_revoke";

/**
 * One append-only `member_revisions` row documenting a consent state change.
 * `originModule` attributes the call to the caller (e.g. `"newsletter"`) —
 * satisfies "attributed" without inventing ADR-024 capability infrastructure
 * (ADR-PIPE-013 Decision §4 capability-gating scope decision).
 */
export interface MemberConsentRevisionRecord {
  seq: number;
  workspaceId: UUID;
  memberId: UUID;
  consentId: UUID;
  purpose: ConsentPurpose;
  op: ConsentRevisionOp;
  beforeJson: JsonObject | null;
  afterJson: JsonObject | null;
  originModule: string;
  createdAt: ISODateTime;
}
