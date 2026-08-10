import type { Express } from "express";

import type { RouteDeps } from "../../types";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — narrow `RouteDeps` slice for the `media` server module.
 *
 * Purpose:
 * Unlike `routes/admin/members/deps.ts`/`routes/admin/integrations/deps.ts` (which `extends
 * RouteDeps` to WIDEN it — a historical pattern from when those fields hadn't landed on the
 * shared `RouteDeps` yet), this is a genuine NARROWING: `mediaRepo`/`assetBlobRepo`/
 * `assetRenditionRepo`/`blobStore`/`transformDefinitionRepo`/`imageTransformer` have been on
 * `RouteDeps` since ADR-027, so this file's only job is to state the exact subset the 6 media
 * routes (5 admin + 1 public rendition) actually read, matching `routes/ops/health.ts`'s
 * `NoDepsRouteRegistrar` precedent for what a module's real dependency surface should look like.
 *
 * How it relates to the project:
 * - `modules/media.ts` takes this same `MediaRouteDeps` shape as its factory parameter.
 * - Any `RouteDeps` object (both `server/app.ts`'s and `server/deps.ts`'s) structurally satisfies
 *   this type already — no composition-root change needed to adopt it.
 */
export type MediaRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "mediaRepo"
  | "assetBlobRepo"
  | "assetRenditionRepo"
  | "blobStore"
  | "transformDefinitionRepo"
  | "imageTransformer"
>;

export type MediaRouteRegistrar = (app: Express, deps: MediaRouteDeps) => void;

/**
 * Slice for the two media-PROVIDER-credential routes (`get-providers.ts`/`put-providers.ts`).
 *
 * Kept separate from `MediaRouteDeps` above rather than widening it: those 7 routes move asset
 * bytes and need the blob/rendition/transform ports, while these 2 store vendor API keys and need
 * the sealer/keyring instead. Neither set reads the other's fields, and a single union would make
 * every asset route look like it depends on the secret store.
 *
 * The sealer and keyring are ADR-058's instances, reused rather than re-derived — `SecretSealerPort`
 * is a generic seal/open primitive and does not need a second domain-separation boundary per table,
 * the same reasoning `adminExecutionCredentials` already relies on.
 */
export type MediaProviderRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "mediaProviderCredentialRepo"
  | "siteAssistantSecretSealer"
  | "siteAssistantSecretKeyring"
>;

export type MediaProviderRouteRegistrar = (app: Express, deps: MediaProviderRouteDeps) => void;
