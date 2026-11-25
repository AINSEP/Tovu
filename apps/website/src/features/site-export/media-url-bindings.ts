import type { MediaRepoPort } from "@jini-ai/core/contracts/site/cms-media";
import type { OriginRegistryPort } from "@jini-ai/core/contracts/server/verified-origin";
import { findMediaByIdOrSlug } from "@jini-ai/cms/media";
import { mediaPublicPath } from "@jini-ai/cms/media/site/public-path";
import { resolveContentTypes, type ContentTypeDeps } from "@jini-ai/cms/media/site/content-type-resolution";
import type { ExportMediaUrlDeps } from "@jini-ai/devops/static-export/site/media-original-urls";

export type ExportMediaUrlHostDeps = ContentTypeDeps & { mediaRepo: MediaRepoPort; originRegistry: OriginRegistryPort };

export function bindExportMediaUrls({ deps }: { deps: ExportMediaUrlHostDeps }, _optional: Record<string, never> = {}): ExportMediaUrlDeps<NonNullable<Awaited<ReturnType<typeof findMediaByIdOrSlug>>>> {
  return {
    workspaceId: deps.workspaceId,
    originRegistry: deps.originRegistry,
    findMedia: input => findMediaByIdOrSlug({ deps, input }),
    resolveContentTypes: ({ media }) => resolveContentTypes({ deps, media }),
    mediaPublicPath,
  };
}
