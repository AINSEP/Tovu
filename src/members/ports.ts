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
 *
 * `MailerPort` is imported from the shared `../mail` core primitive (ADR-037) — it is no
 * longer declared locally (Round-3 audit fold, TM-admin-sweep-001: the local shape here
 * predated ADR-037 and didn't match its frozen contract).
 *
 * NOT a port in v1 (ADR-006 letter — no second adapter *being built now*):
 *  - Payment/billing. It is a deferred tier-3 seam, not core code: a billing
 *    plugin writes `source='billing'` subscription rows through the core
 *    chokepoint under a capability. See ADR-030 §6. No PaymentPort here.
 *
 * Interfaces and types only — no feature logic.
 */
import type { ClockPort, IdGeneratorPort, ISODateTime, UUID } from "../core/ports";
import type { MailerPort } from "../mail";
import type { OriginRegistryPort } from "../origin";
import type {
  ConsentPurpose,
  MagicLinkTokenRecord,
  MemberAccessDecision,
  MemberConsentRecord,
  MemberConsentRevisionRecord,
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

/**
 * D1c consent persistence seam (ADR-PIPE-013 Decision §4, C-002). Backs the
 * `member_consents` value table plus the shared `member_revisions` ledger
 * (`entity_kind='consent'`) — mirrors `SettingsRepoPort`'s combined
 * value+revision-ledger shape (`repo.ts`/`repo.sqlite.ts` both implement one
 * port covering both tables, not two separate ports). Package-private write
 * access is enforced at `consent-service.ts`'s module boundary, not here — no
 * other module may import `repo.memory.ts`/`repo.sqlite.ts` directly.
 */
export interface MemberConsentRepoPort {
  findByMemberAndPurpose(required: {
    workspaceId: UUID;
    memberId: UUID;
    purpose: ConsentPurpose;
  }): Promise<MemberConsentRecord | null>;
  /** Upsert by `id` (mirrors every other repo port's `save` shape). */
  save(record: MemberConsentRecord): Promise<void>;
  /** Append one immutable ledger row; returns the assigned monotonic `seq`. */
  appendRevision(record: Omit<MemberConsentRevisionRecord, "seq">): Promise<number>;
  /** Read the ledger, ascending by `seq`. Mainly a test/audit seam — no shipping caller reads this yet. */
  listRevisions(required: {
    workspaceId: UUID;
    memberId: UUID;
    purpose?: ConsentPurpose;
  }): Promise<MemberConsentRevisionRecord[]>;
  /**
   * Wrap a value write + its same-tx revision append atomically (mirrors
   * `SettingsRepoPort.transaction`). The in-memory adapter's implementation is
   * a same-tick passthrough (no real rollback possible/needed); the SQLite
   * adapter uses a real `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/* -------------------------------------------------------------------------- */
/* MailerPort — imported from the shared `mail` core primitive (ADR-037).     */
/* Members' `send(email)` simplicity survives as SDK sugar (`mail.sendSimple`)*/
/* over the one shared port — one interface, one wrapper, never a second     */
/* port (ADR-037 §5). The members lib never talks to a provider SDK.         */
/* -------------------------------------------------------------------------- */

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
  /**
   * ADR-040 canonical-origin registry (ADR-PIPE-013 Decision §3) — optional:
   * no composition root in this repo wires a real `OriginRegistryPort`
   * instance into `members` yet. `requestSignInLink` treats an absent
   * `origin` exactly like `OriginNotVerifiedError` (relative-link fallback,
   * no warning log — an unwired dependency isn't an operator
   * misconfiguration). When present, a workspace with a verified origin gets
   * an absolute magic-link URL instead of today's relative path.
   */
  origin?: OriginRegistryPort;
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
