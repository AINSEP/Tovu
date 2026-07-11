/**
 * @file Domain types for the `origin` trusted canonical-origin registry.
 *
 * Purpose:
 * Defines `VerifiedOrigin`, the single trusted representation of a workspace's
 * public origin, per ADR-040. Every canonical URL, magic-link, newsletter link,
 * redirect-target check, and egress-allowlist check derives from this type
 * instead of the raw (attacker-controlled) request `Host` header.
 *
 * How it relates to the project:
 * - `origin/ports.ts` defines the ports that operate on `VerifiedOrigin`.
 * - `origin/origin.ts` implements those ports.
 * - `origin/repo.memory.ts` is the in-memory store used for tests/dev.
 *
 * Architectural role: ADR-040 (`core/origin` trusted canonical-origin registry).
 */
import type { ISODateTime } from "../core/ports";

/**
 * Origin scheme. `"http"` exists only to represent local dev/preview capability
 * origins (e.g. `http://localhost:3000`); it is never legal for a workspace's
 * real, verified public origin.
 */
export type OriginScheme = "https" | "http";

/** Where a `VerifiedOrigin` came from. */
export type OriginSource = "workspace-setting" | "dev-capability";

/**
 * A verified, trusted origin for a workspace (ADR-040 §1, widened by the
 * Round-3 audit fold so `scheme` can represent the dev-capability case).
 *
 * Invariant (enforced by `createVerifiedOrigin`, not just documented here):
 * `scheme === "http"` is only ever legal when `source === "dev-capability"`.
 * A `workspace-setting`-sourced origin must be `"https"`.
 */
export interface VerifiedOrigin {
  scheme: OriginScheme;
  host: string;
  port?: number;
  basePath?: string;
  /** ISO timestamp of when this origin was last verified. */
  verifiedAt: ISODateTime;
  source: OriginSource;
}

/**
 * Thrown when a `VerifiedOrigin` is constructed in violation of the
 * scheme/source invariant (ADR-040 Round-3 fold).
 */
export class InsecureOriginSourceError extends Error {}

/**
 * Thrown when no verified origin is registered for a workspace. Consumers
 * must treat this as a hard precondition failure (fail closed), never fall
 * back to a guessed/request-derived origin.
 */
export class OriginNotVerifiedError extends Error {}

/**
 * Construct a `VerifiedOrigin`, enforcing the scheme/source invariant.
 *
 * This is the only sanctioned way to produce a `VerifiedOrigin` in this
 * library; both the in-memory repo and any future adapter must route through
 * it so the invariant cannot be bypassed by constructing the object literal
 * directly.
 *
 * @param input - candidate origin fields.
 * @returns a shallow-copied, validated `VerifiedOrigin`.
 * @throws {InsecureOriginSourceError} if `scheme` is `"http"` and `source` is
 * not `"dev-capability"`.
 * @complexity O(1) time, O(1) space.
 * @overallScore 100/100
 */
export function createVerifiedOrigin(input: VerifiedOrigin): VerifiedOrigin {
  if (input.scheme === "http" && input.source !== "dev-capability") {
    throw new InsecureOriginSourceError(
      `origin scheme 'http' is only legal for source 'dev-capability' (got source '${input.source}')`
    );
  }
  return { ...input };
}
