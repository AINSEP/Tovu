import type { PublicPostRecord as PostRecord } from "@jini-ai/cms/posts/post";
import { listPublishedPostPreviews } from "@jini-ai/cms/posts/post-read";
import type { MemberContext } from "@jini-ai/user-management/members/types";
import type { MemberAccessResolver } from "@jini-ai/user-management/members/ports";
// Keep request rendering separate from theme installation, imports, and agent tools.
import { postPreviewsBatchSize, isPagedPostPreviewsMarker, type StaticPostPreview, type StaticListingBatch, type StaticPostPreviewsPage } from "#src/features/theme/static-render-previews";
import { postPublicPath } from "#src/platform/routing/index";
import { featuredImageView } from "@jini-ai/cms/public-http/http/site/render/template-render-data";
import type { RouteDeps } from "#src/server/routes/types";
import type { TemplateRenderDeps } from "./deps.js";
import { siteTimeZoneDep } from "./site-title.js";
import { listingState } from "@jini-ai/cms/public-http/routes/site/pages/listing/listing-state";
import { deriveExcerpt } from "@jini-ai/cms/seo";
import { resolveAssignedTermsForRender } from "@jini-ai/cms/public-http/routes/site/pages/render-context/taxonomy";
import { decidePostMemberAccess } from "./member-access.js";
import { resolveMediaTransformVersionsForRender, resolveMediaAssetMetadataForRender } from "./media-metadata.js";
import { resolvePostPreviewsForRender as resolvePostPreviews } from "@jini-ai/cms/public-http/routes/site/pages/render-context/post-previews";

export async function resolvePostPreviewsForRender({ deps, memberAccessResolver, memberContext, pageHtml, pagePath }: { deps: Pick<RouteDeps, "workspaceId" | "postRepo" | "mediaRepo" | "mediaContentTypeStore" | "transformDefinitionRepo" | "entryTermReadRepo"> & Pick<TemplateRenderDeps, "listingBatch" | "listingPage">; memberAccessResolver: MemberAccessResolver; memberContext: MemberContext; pageHtml: string; pagePath: string }, _optional = {}): Promise<{ previews: readonly StaticPostPreview[]; batches: ReadonlyMap<number, StaticListingBatch<StaticPostPreview>>; page?: StaticPostPreviewsPage } | undefined> {
  return resolvePostPreviews({ deps: {
    get workspaceId() { return deps.workspaceId; },
    get listingBatch() { return deps.listingBatch; },
    get listingPage() { return deps.listingPage; },
    listPublishedPostPreviews: ({ limit, offset }) => listPublishedPostPreviews({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, limit, offset } }),
    decidePostMemberAccess: ({ post }) => decidePostMemberAccess({ resolver: memberAccessResolver, post, context: memberContext }),
    postPreviewsBatchSize,
    isPagedPostPreviewsMarker,
    resolveMediaAssetMetadataForRender: ({ post }, optional) => resolveMediaAssetMetadataForRender({ deps, post }, optional),
    resolveMediaTransformVersionsForRender: () => resolveMediaTransformVersionsForRender(deps),
    siteTimeZoneDep: () => siteTimeZoneDep(deps),
    postPublicPath,
    featuredImageView,
    resolveAssignedTermsForRender: ({ post }) => resolveAssignedTermsForRender({ deps, post }),
    listingState,
    deriveExcerpt,
  }, pageHtml, pagePath });
}
