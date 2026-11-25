import { prepareShareContent as prepare } from "@jini-ai/devops/backup/site/share-preparation";
import type { BlobStorePort, ImageTransformerPort } from "#src/features/media/index";
import type { DbOpsPort } from "@jini-ai/core/contracts/site/gated-mutations-ports";
import { runtimeSchemaVersion } from "#src/platform/site-dir/index";
import type { SiteSavedKeysPort } from "@jini-ai/devops/backup/site/saved-keys-port";
import type { ArchiveMediaRewriter } from "@jini-ai/devops/backup/site/archive-media";
import type { SiteBackupSources } from "./sources.js";
import type { SiteBackupInclude } from "@jini-ai/devops/backup/site/sources";
import { checkShareLimits, type ShareDatabaseSanitizer } from "./share-policy.js";
import { bufferArchiveMedia } from "./archive-media.js";
import { prepareArchiveExtensions } from "./archive-extensions.js";
import type { SiteSharePlanContent } from "./plan-content.js";
import { shareSteps } from "./share-steps.js";

/** A share carries every scope: Tovu's scope names, all on. */
const SHARE_INCLUDE: SiteBackupInclude = { database: true, media: true, themes: true, plugins: true, settings: true };

/**
 * Same consistent snapshot and collector as a repository backup, with a fresh DB projection and
 * regenerated portable settings. Media comes ONLY from snapshot records through the blob-store
 * owner, so object-storage sites work and unreferenced/chat upload bytes cannot ride along.
 * `snapshotRoot` is the injected private folder the database snapshot lands in (never the source site).
 * Jini assembles the plan; Tovu stamps its own build version on it under the wire field `tovuVersion`.
 * @complexity O(site entries + snapshot + referenced blob bytes), bounded by archive caps.
 */
export async function prepareShareContent(required: { dbOps: DbOpsPort; snapshotRoot: string; sources: SiteBackupSources; sanitize: ShareDatabaseSanitizer; blobStore: Pick<BlobStorePort, "get" | "sizeOf">; imageTransformer: ImageTransformerPort; rewriteMedia: ArchiveMediaRewriter; savedKeys?: Pick<SiteSavedKeysPort, "capture">; shareId?: string; workspaceId?: string; includeSavedKeys?: boolean }, optional: { signal?: AbortSignal; packageThemesRoot?: string } = {}): Promise<SiteSharePlanContent> {
  const deps = { include: SHARE_INCLUDE, steps: shareSteps, checkShareLimits, prepareExtensions: prepareArchiveExtensions, bufferArchiveMedia, runtimeSchema: runtimeSchemaVersion };
  const { createdAt, ...content } = await prepare({ ...required, deps }, optional);
  return { ...content, tovuVersion: required.sources.tovuVersion, createdAt };
}
