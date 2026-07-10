/**
 * @file Public surface (barrel) for the `members` Tier-2 core library (ADR-030).
 *
 * ADR-009 §1: a module's public contract is its `index.ts`; boundary lint
 * forbids deep imports. This sweep ships INTERFACES AND TYPES ONLY — the command
 * functions, repo adapters, resolver, and write-service implementations are the
 * ADR-030 follow-up build, not this design-only PR.
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
  OutboundEmail,
  MailerPort,
  MemberAccessResolver,
  MembersWriteServiceDeps,
  MembersWriteService,
} from "./ports";
