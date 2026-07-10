/**
 * @file Port contracts + core-service contracts for the `members` library (ADR-030).
 *
 * Purpose:
 * Dependency-inversion seams (ADR-006 rule-of-two) and the shapes of the two
 * core-code contracts that are deliberately NOT ports (single-implementation,
 * ADR-006 / ADR-021 "no PolicyPort" reasoning): the entitlement/access resolver
 * and the single write chokepoint.
 *
 * Ports declared here (each has a real second adapter in v1 → rule-of-two honest):
 *  - Member{,Tier,Subscription,Session,MagicLinkToken}RepoPort — in-memory + SQLite.
 *  - MailerPort — dev-console adapter now, SMTP/provider next (magic-link delivery).
 *
 * NOT a port in v1 (ADR-006 letter — no second adapter *being built now*):
 *  - Payment/billing. It is a deferred tier-3 seam, not core code: a billing
 *    plugin writes `source='billing'` subscription rows through the core
 *    chokepoint under a capability. See ADR-030 §6. No PaymentPort here.
 *
 * Interfaces and types only — no feature logic.
 */
import type { ClockPort, IdGeneratorPort, ISODateTime, UUID } from "../core/ports";
import type {
  MagicLinkTokenRecord,
  MemberAccessDecision,
  MemberContentAccess,
  MemberContext,
  MemberRecord,
  MemberSessionRecord,
  MemberSubscriptionRecord,
  MemberSubscriptionStatus,
  MemberTierRecord,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Repository ports (rule-of-two: in-memory + SQLite, mirroring PostRepoPort)  */
/* -------------------------------------------------------------------------- */

export interface MemberRepoPort {
  findById(required: { workspaceId: UUID; id: UUID }): Promise<MemberRecord | null>;
  findByEmail(required: { workspaceId: UUID; email: string }): Promise<MemberRecord | null>;
  list(required: {
    workspaceId: UUID;
    /** Keyset cursor (ULID id) for stable pagination; omit for first page. */
    afterId?: UUID;
    limit?: number;
  }): Promise<MemberRecord[]>;
  save(record: MemberRecord): Promise<void>;
}

export interface MemberTierRepoPort {
  findById(required: { workspaceId: UUID; id: UUID }): Promise<MemberTierRecord | null>;
  findBySlug(required: { workspaceId: UUID; slug: string }): Promise<MemberTierRecord | null>;
  list(required: { workspaceId: UUID }): Promise<MemberTierRecord[]>;
  save(record: MemberTierRecord): Promise<void>;
}

export interface MemberSubscriptionRepoPort {
  findById(required: { workspaceId: UUID; id: UUID }): Promise<MemberSubscriptionRecord | null>;
  /** All subscriptions for a member (any status), newest first. */
  listByMember(required: { workspaceId: UUID; memberId: UUID }): Promise<MemberSubscriptionRecord[]>;
  /** Active/comped subscriptions only — the entitlement set (ADR-030 §4). */
  listActiveByMember(required: {
    workspaceId: UUID;
    memberId: UUID;
    nowIso: ISODateTime;
  }): Promise<MemberSubscriptionRecord[]>;
  save(record: MemberSubscriptionRecord): Promise<void>;
}

export interface MemberSessionRepoPort {
  findByTokenHash(required: {
    workspaceId: UUID;
    tokenHash: string;
  }): Promise<MemberSessionRecord | null>;
  listByMember(required: { workspaceId: UUID; memberId: UUID }): Promise<MemberSessionRecord[]>;
  save(record: MemberSessionRecord): Promise<void>;
  /** Server-side revocation (single session or all a member's sessions). */
  revoke(required: { workspaceId: UUID; id: UUID; revokedAt: ISODateTime }): Promise<void>;
  revokeAllForMember(required: {
    workspaceId: UUID;
    memberId: UUID;
    revokedAt: ISODateTime;
  }): Promise<void>;
}

export interface MagicLinkTokenRepoPort {
  findByTokenHash(required: {
    workspaceId: UUID;
    tokenHash: string;
  }): Promise<MagicLinkTokenRecord | null>;
  save(record: MagicLinkTokenRecord): Promise<void>;
  /** Mark consumed (single-use); consuming an already-consumed token is denied. */
  consume(required: { workspaceId: UUID; id: UUID; consumedAt: ISODateTime }): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* MailerPort (rule-of-two: dev-console adapter now, SMTP/provider next)        */
/* -------------------------------------------------------------------------- */

/** A rendered outbound email. The members lib never talks to a provider SDK. */
export interface OutboundEmail {
  workspaceId: UUID;
  to: string;
  subject: string;
  /** Plain-text body; HTML rendering is the adapter's concern. */
  text: string;
  /** Optional pre-rendered HTML. */
  html?: string;
}

/**
 * Email delivery seam. Adapters: `ConsoleMailerAdapter` (logs the link in dev,
 * built now) → `SmtpMailerAdapter`/provider (next). Shared core port; the
 * members lib consumes it for magic-link + lifecycle notifications.
 */
export interface MailerPort {
  send(email: OutboundEmail): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Core-code contracts that are NOT ports (single evaluator — ADR-006/021)     */
/* -------------------------------------------------------------------------- */

/**
 * Entitlement/content-gating resolver. This is ordinary core code called at the
 * site read chokepoint — NOT a port and NOT the ADR-021 operator RBAC
 * `authorize()`. It decides content visibility on the *entitlement* axis (tier
 * membership), exactly as ADR-021 keeps plugin capabilities on a separate axis.
 * One evaluator ⇒ no port (ADR-006, the "no PolicyPort" reasoning of ADR-021 §2).
 */
export interface MemberAccessResolver {
  /**
   * Resolve the request's membership context from a validated member session.
   * Anonymous/absent session ⇒ `{ isAuthenticated: false, activeTierIds: [] }`.
   * Never trusts a client-supplied claim.
   */
  resolveContext(required: {
    workspaceId: UUID;
    /** Raw session token from the member cookie (public origin only). */
    sessionToken?: string;
    nowIso: ISODateTime;
  }): Promise<MemberContext>;

  /**
   * Decide whether `context` may read an entry carrying `access`. Pure function
   * of the declared visibility + the context's active tiers; fail-closed on any
   * unknown visibility value (ADR-021 §8 fail-closed lineage).
   */
  decide(required: { access: MemberContentAccess; context: MemberContext }): MemberAccessDecision;
}

/**
 * The single write chokepoint for all member-domain mutations (ADR-022 §4a /
 * ADR-028 §4 discipline: authorize/entitle → validate → upsert + append revision
 * in ONE transaction → emit outbox event). Repo ports above are package-private
 * behind this service; no module writes member tables by any other path (CI
 * canary asserts it). Interface-only here; implementation is ADR-030's follow-up.
 *
 * Operator-initiated calls (tier/subscription/comp management) also flow through
 * the ADR-018 admin command gateway so they are audited + revertible; member
 * self-service calls (sign-up, profile edit) are attributed to the member
 * principal in the same revision ledger.
 */
export interface MembersWriteServiceDeps {
  clock: ClockPort;
  ids: IdGeneratorPort;
  members: MemberRepoPort;
  tiers: MemberTierRepoPort;
  subscriptions: MemberSubscriptionRepoPort;
  sessions: MemberSessionRepoPort;
  magicLinks: MagicLinkTokenRepoPort;
  mailer: MailerPort;
}

export interface MembersWriteService {
  /** Begin passwordless sign-in/up: mint a hashed magic token + mail the link. */
  requestSignInLink(required: {
    deps: MembersWriteServiceDeps;
    input: { workspaceId: UUID; email: string; redirectPath?: string };
  }): Promise<{ delivered: true }>;

  /** Consume a magic token: verify email, upsert member, mint a member session. */
  completeSignIn(required: {
    deps: MembersWriteServiceDeps;
    input: { workspaceId: UUID; token: string; userAgent?: string; ip?: string };
  }): Promise<{ member: MemberRecord; session: MemberSessionRecord }>;

  /** Operator/self profile update (validated, revision-recorded). */
  updateProfile(required: {
    deps: MembersWriteServiceDeps;
    input: { workspaceId: UUID; memberId: UUID; name?: string; note?: string };
  }): Promise<{ member: MemberRecord }>;

  /** Operator: disable a member (ADR-021 §5 disable-only, never hard-delete). */
  disableMember(required: {
    deps: MembersWriteServiceDeps;
    input: { workspaceId: UUID; memberId: UUID };
  }): Promise<{ member: MemberRecord }>;

  /** Operator: grant a comp subscription (free/comped entitlement). */
  compSubscription(required: {
    deps: MembersWriteServiceDeps;
    input: { workspaceId: UUID; memberId: UUID; tierId: UUID };
  }): Promise<{ subscription: MemberSubscriptionRecord }>;

  /**
   * Change a subscription's status (cancel/expire). The `billing` source is
   * written here by the future tier-3 billing plugin via capability — core v1
   * uses this for comp lifecycle only (ADR-030 §6).
   */
  setSubscriptionStatus(required: {
    deps: MembersWriteServiceDeps;
    input: {
      workspaceId: UUID;
      subscriptionId: UUID;
      status: MemberSubscriptionStatus;
      externalRef?: string;
    };
  }): Promise<{ subscription: MemberSubscriptionRecord }>;
}
