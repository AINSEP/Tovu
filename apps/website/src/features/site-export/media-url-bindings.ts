import type { MediaRepoPort } from "@jini-ai/core/contracts/site/cms-media";
import type { OriginRegistryPort } from "@jini-ai/core/contracts/server/verified-origin";
import { findMediaByIdOrSlug } from "@jini-ai/cms/media";
import { mediaPublicPath } from "@jini-ai/cms/media/site/public-path";
import { resolveContentTypes, type ContentTypeDeps } from "@jini-ai/cms/media/site/content-type-resolution";
import type { ExportMediaUrlDeps } from "@jini-ai/devops/static-export/site/media-original-urls";

/** @file Binds Jini's export media-URL rewrite to this host's media repo, content-type backfill and public path owners. */

/** The host deps slice the export's media rewrite reads; `ExportSiteRouteDeps` extends it. */
export type ExportMediaUrlHostDeps = ContentTypeDeps & { mediaRepo: MediaRepoPort; originRegistry: OriginRegistryPort };

/** The record the media library hands back; inferred from its owner rather than restated. */
type ExportMediaRecord = NonNullable<Awaited<ReturnType<typeof findMediaByIdOrSlug>>>;

/** Callbacks for Jini's rewrite: the route's workspace, the media library lookup and the library's read-path content-type backfill.
 * @complexity O(1) to bind; each callback costs what its owner costs. */
export function bindExportMediaUrls({ deps }: { deps: ExportMediaUrlHostDeps }, _optional: Record<string, never> = {}): ExportMediaUrlDeps<ExportMediaRecord> {
  return {
    workspaceId: deps.workspaceId,
    originRegistry: deps.originRegistry,
    findMedia: ({ workspaceId, idOrSlug }, _options = {}) => findMediaByIdOrSlug({ deps, input: { workspaceId, idOrSlug } }),
    resolveContentTypes: ({ media }, _options = {}) => resolveContentTypes({ deps, media }),
    mediaPublicPath,
  };
}
