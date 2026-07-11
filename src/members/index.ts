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
} from "./types";

export {
  MemberAuthError,
  MemberValidationError,
  MemberConflictError,
  MemberNotFoundError,
} from "./types";

export type {
  MemberRepoPort,
  MemberTierRepoPort,
  MemberSubscriptionRepoPort,
  MemberSessionRepoPort,
  MagicLinkTokenRepoPort,
  MemberAccessResolver,
  MembersWriteServiceDeps,
  MembersWriteService,
} from "./ports";

// `MailerPort` is the shared `../mail` core primitive (ADR-037) — re-exported here so existing
// `members` consumers don't need to know the type moved.
export type { MailerPort, OutboundEmail } from "../mail";

export {
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,
} from "./repo.memory";

export { ConsoleMailerAdapter, type ConsoleMailerAdapterDeps } from "./mailer.console";

export {
  DefaultMemberAccessResolver,
  type MemberAccessResolverDeps,
} from "./access-resolver";

export {
  compSubscription,
  completeSignIn,
  disableMember,
  membersWriteService,
  requestSignInLink,
  setSubscriptionStatus,
  updateProfile,
} from "./write-service";

// `SubscriberDirectoryPort` consumer-side seam Members implements (`../newsletter/ports`).
export {
  MembersSubscriberDirectory,
  type MembersSubscriberDirectoryDeps,
} from "./subscriber-directory";
