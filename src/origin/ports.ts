/**
 * @file Port contracts for the `origin` trusted canonical-origin registry.
 *
 * Purpose:
 * Declares `OriginRegistryPort` (the app-facing seam every SEO/identity/
 * newsletter/redirects/egress consumer depends on) and `OriginSettingRepoPort`
 * (the storage seam behind it), per ADR-040.
 *
 * Architectural role:
 * Dependency-inversion seam. No consumer outside this library may read the
 * raw request `Host`/`:authority` for a canonical/link/allowlist/redirect
 * decision (ADR-040 F2) — they call these ports instead.
 */
import type { UUID } from "@jini-ai/cms/core";
import type { VerifiedOrigin } from "./types.js";

/** Context for resolving a workspace's canonical origin. */
export interface OriginContext {
  workspaceId: UUID;
  siteId?: UUID;
  locale?: string;
}

/**
 * Context for a redirect-target check (ADR-040 F5: kept in parity with
 * `OriginContext` plus `originKey` for future multi-origin resolution).
 */
export interface RedirectTargetContext {
  workspaceId: UUID;
  siteId?: UUID;
  originKey?: string;
}

/** Context for an egress-target check. */
export interface EgressTargetContext {
  workspaceId: UUID;
  siteId?: UUID;
}

/**
 * The single trusted seam for canonical-origin, open-redirect, and
 * egress-target decisions (ADR-040 §1, F3, F4).
 */
export interface OriginRegistryPort {
  /**
   * Resolve the verified canonical origin for a workspace.
   * @throws {import("./types").OriginNotVerifiedError} if no verified origin
   * is registered — this is a fail-closed precondition, never a guess.
   */
  canonicalOrigin(ctx: OriginContext): Promise<VerifiedOrigin>;

  /**
   * The single open-redirect oracle (ADR-040 F3). Same-origin targets are
   * always allowed; cross-origin targets are allowed only via the
   * workspace's explicit redirect allowlist (exact host match).
   * Fails closed (`false`) on any parse failure or ambiguity.
   */
  isAllowedRedirectTarget(ctx: RedirectTargetContext, url: string): Promise<boolean>;

  /**
   * The single third-party egress-target oracle (ADR-040 F4), backed by a
   * separate per-workspace egress-destination allowlist. Fails closed
   * (`false`) on any parse failure or ambiguity.
   */
  isAllowedEgressTarget(ctx: EgressTargetContext, url: string): Promise<boolean>;
}

/**
 * Storage seam behind `OriginRegistryPort`: the verified origin plus the two
 * distinct per-workspace allowlists (redirect targets, egress targets).
 */
export interface OriginSettingRepoPort {
  /** The workspace's verified origin, or `null` if none is registered yet. */
  findByWorkspaceId(workspaceId: UUID): Promise<VerifiedOrigin | null>;
  /** Exact-match hosts allowed as cross-origin redirect targets. */
  findRedirectAllowlist(workspaceId: UUID): Promise<string[]>;
  /** Exact-match hosts allowed as third-party egress destinations. */
  findEgressAllowlist(workspaceId: UUID): Promise<string[]>;
}
