/**
 * @file Deps bundle for the new PUBLIC (unauthenticated) `members` route family
 * (ADR-PIPE-013 Decision §2-3).
 *
 * Purpose:
 * `MemberPublicRouteDeps` is deliberately NARROWER than
 * `routes/admin/members/deps.ts`'s `MembersRouteDeps` — no `authorize`, no
 * session/principal dependency at all. This route family
 * (`POST .../sign-in`, `POST .../sign-in/complete`) must stay unauthenticated
 * by design (ADR-030 §3): a visitor has no admin session, and must never be
 * required to have one to sign in.
 *
 * Architectural role:
 * Composition-boundary glue only — no business logic. Mirrors
 * `routes/admin/members/deps.ts`'s `toMembersWriteServiceDeps` helper.
 */
import type {
  MagicLinkTokenRepoPort,
  MailerPort,
  MemberRepoPort,
  MemberSessionRepoPort,
  MemberSubscriptionRepoPort,
  MemberTierRepoPort,
  MembersWriteServiceDeps,
} from "../../../members";
import type { ClockPort, IdGeneratorPort, UUID } from "../../../core/ports";
import type { OriginRegistryPort } from "../../../origin";
import type { RateLimiter } from "../../middleware/rate-limit";

/**
 * Deps the public sign-in/complete-sign-in routes need. Intentionally has NO
 * `authorize`/session field — see file header. The 3 rate-limiter instances
 * are shared, app-boot-scoped singletons (C-015): `magicLinkPerEmailLimiter`
 * is the SAME instance the admin `request-magic-link.ts` route also
 * consults, so the two surfaces share one counter per email, not two.
 */
export interface MemberPublicRouteDeps {
  workspaceId: UUID;
  memberRepo: MemberRepoPort;
  memberTierRepo: MemberTierRepoPort;
  memberSubscriptionRepo: MemberSubscriptionRepoPort;
  memberSessionRepo: MemberSessionRepoPort;
  magicLinkRepo: MagicLinkTokenRepoPort;
  mailer: MailerPort;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  /** ADR-040 canonical-origin registry — optional, see `MembersWriteServiceDeps.origin`'s doc. */
  origin?: OriginRegistryPort;
  magicLinkPerEmailLimiter: RateLimiter;
  magicLinkPerIpLimiter: RateLimiter;
  magicLinkCompleteAttemptLimiter: RateLimiter;
}

/** Assemble the `MembersWriteServiceDeps` bundle from `MemberPublicRouteDeps`. */
export function toPublicMembersWriteServiceDeps(deps: MemberPublicRouteDeps): MembersWriteServiceDeps {
  return {
    clock: deps.clock,
    ids: deps.idGen,
    members: deps.memberRepo,
    tiers: deps.memberTierRepo,
    subscriptions: deps.memberSubscriptionRepo,
    sessions: deps.memberSessionRepo,
    magicLinks: deps.magicLinkRepo,
    mailer: deps.mailer,
    origin: deps.origin,
  };
}
