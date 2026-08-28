/**
 * @file Public surface (barrel) for the `members` Tier-2 core library (ADR-030).
 *
 * ADR-009 §1: a module's public contract is its `index.ts`; boundary lint
 * forbids deep imports. This now ships the real in-memory repo adapters, the
 * console mail adapter, the `MemberAccessResolver` implementation, and the
 * `MembersWriteService` implementation (the ADR-030 follow-up build) in
 * addition to the original interfaces/types.
 *
 * Placement note: this staging location is `src/members/` per the design brief;
 * the module's production home is `src/features/membership/` (matching the admin
 * sitemap's `features/membership`), and in the target monorepo layout a Tier-2
 * lib at `packages/core/src/lib/members/` (tovu-v2-design §3.5). See ADR-030.
 */
export type {
  MemberPrincipalKind,
  MemberStatus,
  MemberRecord,
  MemberTierType,
  MemberTierStatus,
  MemberTierRecord,
  MemberSubscriptionStatus,
  MemberSubscriptionSource,
  MemberSubscriptionRecord,
  MemberSessionRecord,
  MagicLinkTokenRecord,
  MemberContentVisibility,
  MemberContentAccess,
  MemberContext,
  MemberAccessDecision,
  ConsentPurpose,
  ConsentStatus,
  ConsentEvidence,
  ConsentRevisionOp,
  MemberConsentRecord,
  MemberConsentRevisionRecord,
} from "./types.js";

export {
  MemberAuthError,
  MemberValidationError,
  MemberConflictError,
  MemberNotFoundError,
} from "./types.js";

export type {
  MemberRepoPort,
  MemberTierRepoPort,
  MemberSubscriptionRepoPort,
  MemberSessionRepoPort,
  MagicLinkTokenRepoPort,
  MemberConsentRepoPort,
  MemberAccessResolver,
  MembersWriteServiceDeps,
  MembersWriteService,
} from "./ports.js";

// `MailerPort` is the shared `../mail` core primitive (ADR-037) — re-exported here so existing
// `members` consumers don't need to know the type moved.
export type { MailerPort, OutboundEmail } from "../../platform/mail/index.js";

export {
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberConsentRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,
} from "./repo.memory.js";

// ADR-046 Phase 1 (2026-07-16): the ADR-006 rule-of-two "second adapter" half — already fully
// built and contract-tested (`__tests__/repo.contract.test.ts`) but never wired into a real
// composition root until now (`server/deps.ts`).
export {
  SqliteMagicLinkTokenRepo,
  SqliteMemberConsentRepo,
  SqliteMemberRepo,
  SqliteMemberSessionRepo,
  SqliteMemberSubscriptionRepo,
  SqliteMemberTierRepo,
} from "./repo.sqlite.js";

export { ConsoleMailerAdapter, type ConsoleMailerAdapterDeps } from "./mailer.console.js";

export {
  DefaultMemberAccessResolver,
  type MemberAccessResolverDeps,
} from "./access-resolver.js";

export {
  compSubscription,
  completeSignIn,
  disableMember,
  membersWriteService,
  requestSignInLink,
  setSubscriptionStatus,
  updateProfile,
} from "./write-service.js";

// D1c consent chokepoint (ADR-PIPE-013 Decision §4) — kept separate from `write-service.ts`.
export {
  checkConsent,
  confirmConsent,
  requestConsent,
  revokeConsent,
  type ConsentServiceDeps,
} from "./consent-service.js";

// `SubscriberDirectoryPort` consumer-side seam Members implements (`../newsletter/ports`).
export {
  MembersSubscriberDirectory,
  type MembersSubscriberDirectoryDeps,
} from "./subscriber-directory.js";
