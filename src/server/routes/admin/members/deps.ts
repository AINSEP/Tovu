/**
 * @file Shared `RouteDeps` extension for the members admin routes (ADR-030 wiring).
 *
 * Purpose:
 * `src/server/routes/types.ts` does not yet declare the `members` library's
 * repo ports / mailer as `RouteDeps` fields. That file is being extended by
 * several parallel agents right now (each wiring a different admin section),
 * so this task is explicitly scoped to avoid editing it directly (see the
 * dispatch directive — the exact fields to add there are reported back
 * instead of applied here).
 *
 * This file defines `MembersRouteDeps` — `RouteDeps` intersected with the
 * fields the members routes need — plus a helper that assembles the
 * `MembersWriteServiceDeps` bundle `write-service.ts` requires. Each route in
 * this directory narrows its `RouteDeps` argument to `MembersRouteDeps` via a
 * cast (safe: `MembersRouteDeps` is a strict subtype/extension of `RouteDeps`,
 * so the cast only narrows, never widens). Once `RouteDeps` is amended
 * upstream to declare these fields directly, the cast becomes provably
 * redundant and can be deleted with no behavior change.
 *
 * Architectural role:
 * Composition-boundary glue only — no business logic. Mirrors how
 * `routes/admin/change-sets/revert.ts` assembles a multi-port deps bundle
 * (`reverterDeps`) inline; factored out here because four route files share
 * the same bundle shape.
 */
import type {
  MagicLinkTokenRepoPort,
  MailerPort,
  MemberRepoPort,
  MemberSessionRepoPort,
  MemberSubscriptionRepoPort,
  MemberTierRepoPort,
  MembersWriteServiceDeps,
} from "#src/members/index";
import type { RateLimiter } from "#src/core/rate-limit/rate-limit";
import type { RouteDeps } from "../../types";

/**
 * `RouteDeps` extended with the `members` library's ports. Not yet part of
 * the shared `RouteDeps` interface — see file header. Field names match what
 * this task's final report proposes adding to `RouteDeps` verbatim, so wiring
 * them in later is a pure additive change.
 */
export interface MembersRouteDeps extends RouteDeps {
  memberRepo: MemberRepoPort;
  memberTierRepo: MemberTierRepoPort;
  memberSubscriptionRepo: MemberSubscriptionRepoPort;
  memberSessionRepo: MemberSessionRepoPort;
  magicLinkRepo: MagicLinkTokenRepoPort;
  mailer: MailerPort;
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
  };
}
