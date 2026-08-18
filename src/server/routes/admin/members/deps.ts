/**
 * @file Shared `RouteDeps` extension for the members admin routes (ADR-030 wiring).
 *
 * Purpose:
 * This file defines `MembersRouteDeps` — `RouteDeps` intersected with the
 * fields the members routes need — plus a helper that assembles the
 * `MembersWriteServiceDeps` bundle `write-service.ts` requires. Each route in
 * this directory narrows its `RouteDeps` argument to `MembersRouteDeps` via a
 * cast (safe: `MembersRouteDeps` is a strict subtype/extension of `RouteDeps`,
 * so the cast only narrows, never widens).
 *
 * 2026-08-18 (`RouteDeps` decomposition Slice 3): the header above used to say
 * "`src/server/routes/types.ts` does not yet declare the `members` library's
 * repo ports / mailer as `RouteDeps` fields... this task is explicitly scoped
 * to avoid editing it directly" — that was true when this file was written,
 * but ADR-030 wiring has since landed all 6 fields directly on `RouteDeps`
 * (now grouped as `routes/types.ts`'s own `MembersDeps`), which made the
 * `extends RouteDeps` shape's re-declaration of those same 6 fields
 * redundant, the exact stale-`extends`-widening state `routes/admin/
 * integrations/deps.ts`'s `IntegrationsRouteDeps` was in before its own
 * SPEC-034 fix. `MembersRouteDeps` now composes the named `MembersDeps` group
 * instead of re-typing the 6 fields a second time — `magicLinkPerEmailLimiter`
 * is the one genuine addition `RouteDeps` still does not carry, so `extends
 * RouteDeps` stays (this type is still a strict subtype of `RouteDeps`, so
 * every existing `routeDeps as MembersRouteDeps` cast below stays valid
 * unchanged).
 *
 * Architectural role:
 * Composition-boundary glue only — no business logic. Mirrors how
 * `routes/admin/change-sets/revert.ts` assembles a multi-port deps bundle
 * (`reverterDeps`) inline; factored out here because four route files share
 * the same bundle shape.
 */
import type { MembersWriteServiceDeps } from "#src/members/index";
import type { RateLimiter } from "#src/core/rate-limit/rate-limit";
import type { MembersDeps, RouteDeps } from "../../types";

/**
 * `RouteDeps` extended with the `members` library's ports. `MembersDeps`
 * supplies the 6 repo/mailer fields (verbatim, already part of `RouteDeps`
 * via intersection — see file header); `magicLinkPerEmailLimiter` below is
 * this file's own addition, not yet on `RouteDeps`.
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
  };
}
