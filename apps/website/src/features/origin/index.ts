/**
 * Trusted-origin type rationale, retained after moving implementation to
 * Jini packages/http-kit/src/verified-origin/types.ts.
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
 *
 * Origin scheme. `"http"` exists only to represent local dev/preview capability
 * origins (e.g. `http://localhost:3000`); it is never legal for a workspace's
 * real, verified public origin.
 *
 * Where a `VerifiedOrigin` came from.
 *
 * A verified, trusted origin for a workspace (ADR-040 §1, widened by the
 * Round-3 audit fold so `scheme` can represent the dev-capability case).
 *
 * Invariant (enforced by `createVerifiedOrigin`, not just documented here):
 * `scheme === "http"` is only ever legal when `source === "dev-capability"`.
 * A `workspace-setting`-sourced origin must be `"https"`.
 *
 * ISO timestamp of when this origin was last verified.
 *
 * Thrown when a `VerifiedOrigin` is constructed in violation of the
 * scheme/source invariant (ADR-040 Round-3 fold).
 *
 * Thrown when no verified origin is registered for a workspace. Consumers
 * must treat this as a hard precondition failure (fail closed), never fall
 * back to a guessed/request-derived origin.
 *
 * Construct a `VerifiedOrigin`, enforcing the scheme/source invariant.
 *
 * The package function is the only sanctioned way to produce a `VerifiedOrigin`; both the in-memory repo and any future adapter must route through
 * it so the invariant cannot be bypassed by constructing the object literal
 * directly.
 *
 * @param input - candidate origin fields.
 * @returns a shallow-copied, validated `VerifiedOrigin`.
 * @throws {InsecureOriginSourceError} if `scheme` is `"http"` and `source` is
 * not `"dev-capability"`.
 * @complexity O(1) time, O(1) space.
 */
// Trusted-origin rationale: Jini packages/http-kit/src/verified-origin/types.ts (Tovu ADR-040).
export {
  type OriginScheme,
  type OriginSource,
  type VerifiedOrigin,
  InsecureOriginSourceError,
  OriginNotVerifiedError,
  createVerifiedOrigin,
} from "@jini-ai/http-kit/verified-origin";
export type {
  OriginContext,
  RedirectTargetContext,
  EgressTargetContext,
  OriginRegistryPort,
  OriginSettingRepoPort,
} from "./ports.js";
export {
  OriginRegistry,
  hasForbiddenRawUrlCharacter,
  isSameOrigin,
  normalizeOriginCandidate,
  type NormalizedTarget,
  type OriginRegistryDeps,
} from "./origin.js";
export { InMemoryOriginSettingRepo, type OriginSettingSeed } from "./repo.memory.js";
export {
  planOriginBoot,
  resolveConfiguredOrigin,
  type ConfiguredOriginOptions,
  type OriginBootPlan,
} from "./configured-origin.js";
