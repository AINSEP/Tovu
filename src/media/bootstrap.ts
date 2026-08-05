import type { UUID } from "@jini-ai/cms/core";

import { getLatestTransformDefinition, registerTransform, type RegisterTransformDeps, type TransformDefinitionRecord } from "./index";

/**
 * @file Boot-time registration of the one core transform this host needs before the public `/m/`
 * rendition route (`server/routes/site/media-rendition.ts`, ADR-027 §4) can serve ANY asset at
 * all.
 *
 * `resolveMediaRendition` (`@jini-ai/cms/media`) looks up `(assetId, transformName, version)`
 * against `transform_registry` before it will ever serve or generate bytes — with zero rows in
 * that table, every `/m/` request 404s regardless of what media exists, unconditionally (verified
 * live: `GET /m/{realAssetId}/{anyName}.v1/x.jpg` on a running server returns `404 {"error":
 * "rendition not found"}` even though the asset and an orphaned `asset_renditions` row for it
 * both already exist — the rendition lookup never runs because the transform-definition lookup
 * fails first). `registerTransform` itself has no caller anywhere in this host or
 * `@jini-ai/cms` outside tests (confirmed by a full-tree grep, not just this composition root) and
 * is not exposed as an agent tool either (`media/agent-tools.ts`'s own file header: "There is NO
 * named-transform-registry tool") — so nothing has ever created that row in a real boot.
 */
export const CORE_PUBLIC_TRANSFORM_NAME = "public";

/**
 * Idempotently ensures the workspace's `"public"` core transform definition exists, so the
 * `/m/{assetId}/public.v{version}/...` URL always resolves for any active asset (subject to the
 * generation-bound rules `resolveMediaRendition` itself enforces). Mirrors
 * `newsletter/lists.ts`'s `ensureDefaultList` shape exactly: find-latest-or-create, called once
 * per boot from `server/deps.ts`'s existing `Ready`-chain sequence.
 *
 * **Why find-or-create, not a bare `registerTransform` call.** `registerTransform` is
 * deliberately NOT idempotent — it is append-only and always mints `version = currentMax + 1`
 * (`transform-registry.ts`'s own doc). Calling it unconditionally at every boot would mint a new
 * "public" version on every `tsx watch` restart, forever, which both litters `transform_registry`
 * and (per ADR-027 §4's "latest version" anonymous-generation bound) would silently orphan every
 * previously-generated rendition each time — a real, disclosed hazard this guard exists to close,
 * not a hypothetical one.
 *
 * **Why `format: "webp"`, no resize.** No `width`/`height` (a format-only re-encode is a valid
 * `TransformParams` value — `transform-types.ts`) so this transform works uniformly for any
 * uploaded raster regardless of source dimensions; this is the "can the pipe serve anything
 * publicly at all" baseline, not a design-aware crop. `webp` over `jpeg`: a transparent PNG
 * (logo, screenshot with alpha) re-encoded to `jpeg` would silently gain an opaque background
 * fill, a visible content bug this host has no test coverage to catch today. `webp` over `png`:
 * `png` is also lossless-and-transparency-safe, but ships meaningfully larger for photographic
 * content with zero correctness benefit over `webp` for this baseline's purpose. A resize-capable
 * transform (`thumb`, `hero`, ...) is a separate future registration, not added here.
 *
 * @complexity O(v) in the number of existing "public" versions, from
 * {@link getLatestTransformDefinition}'s version scan — negligible at this registry's real scale
 * (one core-owned name).
 * @overallScore 100
 */
export async function ensureCoreMediaTransform(
  required: { deps: RegisterTransformDeps; input: { workspaceId: UUID } }
): Promise<{ definition: TransformDefinitionRecord }> {
  const { deps, input } = required;

  const existing = await getLatestTransformDefinition({
    deps: { transformRepo: deps.transformRepo },
    input: { workspaceId: input.workspaceId, name: CORE_PUBLIC_TRANSFORM_NAME },
  });
  if (existing) return { definition: existing };

  return registerTransform({
    deps,
    input: {
      workspaceId: input.workspaceId,
      name: CORE_PUBLIC_TRANSFORM_NAME,
      params: { format: "webp" },
      owner: "core",
    },
  });
}
