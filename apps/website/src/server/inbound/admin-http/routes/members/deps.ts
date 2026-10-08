/**
 * @file Members admin composition glue (ADR-030).
 *
 * `MembersRouteDeps` extends `RouteDeps` with the shared per-email magic-link limiter;
 * `MembersDeps` names the member repo/mailer group. Route casts remain safe because
 * this is a subtype of `RouteDeps`. The limiter is shared with public sign-in (C-015).
 * `toMembersWriteServiceDeps` assembles the bundle shared by four admin routes.
 */
import type { MembersWriteServiceDeps } from "#src/features/members/index";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import type { MembersDeps, RouteDeps } from "#src/server/routes/types";

/**
 * See the file header for the shared member ports and additional limiter.
 */
export interface MembersRouteDeps extends RouteDeps, MembersDeps {
  /**
   * ADR-PIPE-013 Decision §2-3 (Phase 2) — the SAME `MAGIC_LINK_PER_EMAIL`
   * limiter instance the new public `routes/members/sign-in.ts` route also
   * consults (C-015: one shared counter per email, not two). Consulted by
   * `request-magic-link.ts` strictly AFTER its `authorize()` call (T008),
   * never before (INV-NEW-03).
   */
  magicLinkPerEmailLimiter: RateLimiter;
}

/**
 * Assemble the `MembersWriteServiceDeps` bundle the write-service functions
 * (`disableMember`, `requestSignInLink`, etc.) require, from `MembersRouteDeps`.
 *
 * @complexity O(1) — object construction only.
 * @overallScore 100
 */
export function toMembersWriteServiceDeps(deps: MembersRouteDeps): MembersWriteServiceDeps {
  return {
    clock: deps.clock,
    ids: deps.idGen,
    members: deps.memberRepo,
    tiers: deps.memberTierRepo,
    subscriptions: deps.memberSubscriptionRepo,
    sessions: deps.memberSessionRepo,
    magicLinks: deps.magicLinkRepo,
    mailer: deps.mailer,
    principals: deps.principalRepo,
  };
}
