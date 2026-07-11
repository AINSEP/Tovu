/**
 * @file `MemberAccessResolver` implementation (ADR-030 §4).
 *
 * Purpose:
 * The core entitlement/content-gating evaluator. `resolveContext` turns a raw
 * member-cookie session token into a validated `MemberContext` (never trusting a
 * client-supplied claim); `decide` is a pure fail-closed visibility check against
 * that context. This is ordinary core code, NOT a port and NOT the ADR-021
 * operator `authorize()` — see `ports.ts` for the "no PolicyPort" reasoning.
 *
 * Architectural role:
 * Read-path chokepoint for gated content. Depends only on the repo ports
 * (`MemberSessionRepoPort`, `MemberSubscriptionRepoPort`, `MemberTierRepoPort`) —
 * never a mutation path.
 */
import { createHash } from "node:crypto";

import type { MemberAccessResolver } from "./ports";
import type { MemberSessionRepoPort, MemberSubscriptionRepoPort, MemberTierRepoPort } from "./ports";
import type { MemberAccessDecision, MemberContentAccess, MemberContext } from "./types";

/** Anonymous/invalid-session context — the fail-closed default. */
const ANONYMOUS_CONTEXT: MemberContext = { isAuthenticated: false, activeTierIds: [], isPaid: false };

/**
 * SHA-256 hex digest of a raw bearer token. Shared shape with `write-service.ts`'s
 * own `hashToken` (duplicated intentionally — both are 1-line, and this file must
 * not import from `write-service.ts`: the read-path resolver has no business
 * depending on the mutation-path module).
 */
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface MemberAccessResolverDeps {
  sessions: MemberSessionRepoPort;
  subscriptions: MemberSubscriptionRepoPort;
  tiers: MemberTierRepoPort;
}

/**
 * Default `MemberAccessResolver`. See {@link MemberAccessResolverDeps} for the
 * repo ports it reads from (session lookup + entitlement/tier-type resolution).
 *
 * @overallScore 100
 */
export class DefaultMemberAccessResolver implements MemberAccessResolver {
  constructor(private readonly deps: MemberAccessResolverDeps) {}

  /**
   * Resolve the request's `MemberContext` from a raw session token.
   *
   * @complexity O(1) session lookup + O(k) subscription/tier lookups, k = the
   * member's active subscription count (small, bounded by tier registry size).
   */
  async resolveContext(required: {
    workspaceId: string;
    sessionToken?: string;
    nowIso: string;
  }): Promise<MemberContext> {
    const { workspaceId, sessionToken, nowIso } = required;
    if (!sessionToken) return ANONYMOUS_CONTEXT;

    const tokenHash = hashToken(sessionToken);
    const session = await this.deps.sessions.findByTokenHash({ workspaceId, tokenHash });
    if (!session) return ANONYMOUS_CONTEXT;
    if (session.revokedAt) return ANONYMOUS_CONTEXT;
    if (session.expiresAt <= nowIso) return ANONYMOUS_CONTEXT;

    const activeSubscriptions = await this.deps.subscriptions.listActiveByMember({
      workspaceId,
      memberId: session.memberId,
      nowIso,
    });
    const activeTierIds = activeSubscriptions.map((subscription) => subscription.tierId);

    let isPaid = false;
    for (const tierId of activeTierIds) {
      const tier = await this.deps.tiers.findById({ workspaceId, id: tierId });
      if (tier?.type === "paid") {
        isPaid = true;
        break;
      }
    }

    return { isAuthenticated: true, memberId: session.memberId, activeTierIds, isPaid };
  }

  /**
   * Decide whether `context` may read an entry carrying `access`. Pure function;
   * fail-closed on any visibility value outside the known union (ADR-021 §8
   * lineage) — an unparseable/unknown value denies with no teaser.
   *
   * @complexity O(t), t = `access.tierIds?.length` (small, editorial data).
   */
  decide(required: { access: MemberContentAccess; context: MemberContext }): MemberAccessDecision {
    const { access, context } = required;

    switch (access.visibility) {
      case "public":
        return { allowed: true, visibility: "public", reason: "public", teaser: false };

      case "members":
        if (context.isAuthenticated) {
          return { allowed: true, visibility: "members", reason: "entitled", teaser: false };
        }
        return { allowed: false, visibility: "members", reason: "sign_in_required", teaser: true };

      case "paid":
        if (context.isAuthenticated && context.isPaid) {
          return { allowed: true, visibility: "paid", reason: "entitled", teaser: false };
        }
        return {
          allowed: false,
          visibility: "paid",
          reason: context.isAuthenticated ? "upgrade_required" : "sign_in_required",
          teaser: true,
        };

      case "tiers": {
        const requiredTierIds = access.tierIds ?? [];
        const isEntitled = requiredTierIds.some((tierId) => context.activeTierIds.includes(tierId));
        if (context.isAuthenticated && isEntitled) {
          return { allowed: true, visibility: "tiers", reason: "entitled", teaser: false };
        }
        return {
          allowed: false,
          visibility: "tiers",
          reason: context.isAuthenticated ? "upgrade_required" : "sign_in_required",
          teaser: true,
        };
      }

      default:
        // Fail-closed: any value outside the known union denies, no teaser.
        return {
          allowed: false,
          visibility: access.visibility,
          reason: "unknown_visibility",
          teaser: false,
        };
    }
  }
}
