import { resolveMediaPublicUrls as resolveJiniMediaPublicUrls } from "@jini-ai/cms/media/site/public-urls";
import type { MediaRecord } from "@jini-ai/cms/media";
import type { MediaPublicUrlDeps } from "./contracts.js";

/**
 * @file The ADR-009 door of `features/media` for `/m/...` public URLs. Jini owns the rendition
 * selection and batched lookups (`@jini-ai/cms/media/site/public-urls`); this binding supplies the
 * host collaborators the routes and tools hold: the recorded-content-type store and the transform
 * definition repo, each optional on a host that did not wire it.
 */

/**
 * Batch-resolves each of `assets`' `/m/...` public URL from the host's media dependencies.
 *
 * @returns a map from `MediaRecord.id` to its resolved URL, or `null` for an unresolvable asset.
 * @complexity O(1) queries regardless of `assets.length`.
 */
export function resolveMediaPublicUrls(
  { deps, assets }: { deps: MediaPublicUrlDeps & { workspaceId: string }; assets: readonly MediaRecord[] },
  _optional: Record<string, never> = {},
): Promise<Map<string, string | null>> {
  return resolveJiniMediaPublicUrls({
    assets,
    workspaceId: deps.workspaceId,
    contentTypeStore: deps.mediaContentTypeStore ?? null,
    transformRepo: deps.transformDefinitionRepo ?? null,
  });
}
