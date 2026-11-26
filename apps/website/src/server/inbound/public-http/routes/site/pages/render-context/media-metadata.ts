import type { PublicPostRecord as PostRecord } from "@jini-ai/cms/posts/post";
import { collectCoverMediaRefs } from "@jini-ai/cms/media/cover-image";
import type { StaticFeaturedImage } from "#src/features/theme/index";
import { findMediaByIdOrSlug, getLatestTransformDefinition } from "@jini-ai/cms/media";
import { CORE_PUBLIC_TRANSFORM_NAME } from "@jini-ai/cms/media/site/bootstrap";
import { resolveMediaCaptionsTrack } from "@jini-ai/cms/media/site/public-path";
import type { MediaAssetRenderMeta } from "@jini-ai/core/contracts/site/cms-media";
import { featuredImageView } from "@jini-ai/cms/public-http/http/site/render/template-render-data";
import type { RenderContextResolutionDeps } from "./deps.js";
import { resolveMediaTransformVersionsForRender as resolveTransformVersions, resolveMediaAssetMetadataForRender as resolveAssetMetadata, resolveFeaturedImageForRender as resolveFeaturedImage } from "@jini-ai/cms/public-http/routes/site/pages/render-context/media-metadata";

export async function resolveMediaTransformVersionsForRender(
  deps: Pick<RenderContextResolutionDeps, "workspaceId" | "transformDefinitionRepo">
): Promise<ReadonlyMap<string, number>> {
  return resolveTransformVersions({ deps: {
    get workspaceId() { return deps.workspaceId; },
    get transformDefinitionRepo() { return deps.transformDefinitionRepo; },
    getLatestTransformDefinition,
    CORE_PUBLIC_TRANSFORM_NAME,
  } });
}

export async function resolveMediaAssetMetadataForRender({ deps, post }: { deps: Pick<RenderContextResolutionDeps, "workspaceId" | "mediaRepo" | "mediaContentTypeStore">; post: PostRecord | undefined }, optional: { listed?: readonly PostRecord[] } = {}): Promise<ReadonlyMap<string, MediaAssetRenderMeta>> {
  return resolveAssetMetadata({ deps: {
    get workspaceId() { return deps.workspaceId; },
    get mediaRepo() { return deps.mediaRepo; },
    get mediaContentTypeStore() { return deps.mediaContentTypeStore; },
    collectCoverMediaRefs,
    findMediaByIdOrSlug,
    resolveMediaCaptionsTrack,
  }, post }, optional);
}

export async function resolveFeaturedImageForRender(
  { deps, post }: { deps: Pick<RenderContextResolutionDeps, "workspaceId" | "mediaRepo" | "mediaContentTypeStore" | "transformDefinitionRepo">; post: PostRecord }, _optional: Record<string, never> = {}
): Promise<StaticFeaturedImage | null> {
  return resolveFeaturedImage({ deps: {
    get workspaceId() { return deps.workspaceId; },
    get mediaRepo() { return deps.mediaRepo; },
    get mediaContentTypeStore() { return deps.mediaContentTypeStore; },
    get transformDefinitionRepo() { return deps.transformDefinitionRepo; },
    collectCoverMediaRefs,
    findMediaByIdOrSlug,
    resolveMediaCaptionsTrack,
    getLatestTransformDefinition,
    CORE_PUBLIC_TRANSFORM_NAME,
    featuredImageView,
  }, post });
}
