// Origin-validation rationale: Jini/packages/http-kit/src/verified-origin/configured-origin.ts.
/**
 * @file Tovu's operator-declared public origin (ADR-040 §2/amendment 7).
 * TOVU_PUBLIC_URL is the shared deployment setting, avoiding divergent origin variables.
 * Environment authority already controls deployment; accepted declaration is not reachability
 * or ownership proof. verifiedAt records declaration accepted at boot.
 * Never reuse resolvePublicOrigin(req)'s request-host/forwarded-proto fallback here: persisting
 * request input would poison canonical URLs, sitemap/magic/unsubscribe links and egress verdicts.
 * This adapter preserves the environment name, boot clock and explicit runtime-mode policy.
 */
import {
  resolveConfiguredOrigin as resolveJiniConfiguredOrigin,
  planOriginBoot as planJiniOriginBoot,
  type VerifiedOrigin,
  type OriginBootPlan,
} from "@jini-ai/http-kit/verified-origin";
import { resolveRuntimeMode, type RuntimeMode } from "#src/contracts/core/runtime-mode";
import type { ISODateTime } from "@jini-ai/core/primitives";

export type { OriginBootPlan } from "@jini-ai/http-kit/verified-origin";
export interface ConfiguredOriginOptions {
  /** Defaults to the real `process.env`. Injectable so the refusal pipeline is unit-testable
   *  without mutating the process. */
  env?: Record<string, string | undefined>;
  /** Defaults to `console.warn`. Every refusal emits exactly one line naming the reason, so a
   *  misconfigured deploy is diagnosable from the boot log instead of silently serving relative
   *  URLs. The value logged is a public URL by definition, never a credential. */
  warn?: (message: string) => void;
}

const NO_CONFIG_IN_PRODUCTION_WARNING =
  "No public origin is configured for this production deployment: TOVU_PUBLIC_URL is unset or was " +
  "refused, and the localhost dev-capability seed is never written in production runtime mode. " +
  "Public URLs (sitemap.xml, canonical, og:url, newsletter and magic links) stay relative or " +
  "unavailable until TOVU_PUBLIC_URL names this deployment's origin.";

/**
 * Resolves TOVU_PUBLIC_URL with the composition root's boot timestamp.
 * Jini owns URL parsing, loopback refusal and origin construction; its owner file above explains
 * why raw ambiguous characters are checked before normalization, private intranet hosts remain
 * allowed and omitted optional port/basePath fields differ from explicit undefined.
 * Refuses malformed/non-HTTPS/userinfo/query/fragment/loopback values with one warning; unset or
 * blank values stay quiet. Returns undefined without throwing so malformed config cannot break boot.
 * @param required.now - ISO boot timestamp used as verifiedAt.
 * @returns Workspace-setting evidence or undefined (ADR-040's fail-closed absence).
 * @complexity O(configured URL length); warnings only, no request headers or storage effects.
 */
export function resolveConfiguredOrigin(
  required: { now: ISODateTime },
  optional: ConfiguredOriginOptions = {},
): VerifiedOrigin | undefined {
  return resolveJiniConfiguredOrigin({
    env: optional.env ?? process.env,
    envVarName: "TOVU_PUBLIC_URL",
    clock: { nowIso: () => required.now },
    warn: optional.warn ?? ((message) => console.warn(message)),
  });
}

/**
 * Pure boot decision; the composition root owns registration effects.
 * Only explicit local mode may seed a dev origin. Production and unknown modes fail closed:
 * persisting localhost poisons public links and find-or-create storage can keep that row forever.
 * Preventing a new seed cannot repair old rows; accepted configured evidence must replace them.
 * Absolute-URL read-side degradation remains defense in depth. Without trust evidence, newsletter
 * launch, redirect cross-origin decisions and site-evidence self-fetch must fail closed.
 * @param optional.mode - Defaults to resolveRuntimeMode; injectable for tests.
 * @complexity O(configured URL length).
 */
export function planOriginBoot(
  required: { now: ISODateTime },
  optional: ConfiguredOriginOptions & { mode?: () => RuntimeMode } = {},
): OriginBootPlan {
  return planJiniOriginBoot({
    env: optional.env ?? process.env,
    envVarName: "TOVU_PUBLIC_URL",
    clock: { nowIso: () => required.now },
    warn: optional.warn ?? ((message) => console.warn(message)),
    allowDevSeed: () => (optional.mode ?? resolveRuntimeMode)() === "local",
    missingOriginWarning: NO_CONFIG_IN_PRODUCTION_WARNING,
  });
}
