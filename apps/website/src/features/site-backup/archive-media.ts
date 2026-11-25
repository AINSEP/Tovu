import { bufferArchiveMedia as bufferMedia, type ArchiveMediaCopy, type ArchiveMediaHost } from "@jini-ai/devops/backup/site/archive-media";
import { sniffContentType, sanitizeSvg, computeBlobStorageKey, mimeForTransformFormat, type BlobStorePort, type ImageTransformerPort } from "#src/features/media/index";
import type { ArchiveMediaSource } from "./share-policy.js";
import { sharePathAlias } from "@jini-ai/devops/backup/site/share-file-policy";
import { validateSharePath } from "./share-file-policy.js";
import { shareSteps } from "./share-steps.js";
import type { ShareLedger } from "@jini-ai/devops/backup/site/share-preparation-steps";

type ShareBlobStore = Pick<BlobStorePort, "get" | "sizeOf">;

/** Tovu's media operations, share path policy and capped ledger/blob reads, injected into Jini's archiver. */
const host: ArchiveMediaHost<ShareLedger, ShareBlobStore> = {
  operations: { sniffContentType, sanitizeSvg, computeBlobStorageKey, mimeForTransformFormat },
  paths: { validateSharePath, sharePathAlias },
  sharePolicy: shareSteps,
};

/** Picks exactly one public copy per item, in id order, without writing to the source site.
 * @throws SiteShareRefusal naming missing, corrupt or unbounded media; raster failures never fall back to raw bytes.
 * @complexity O(items log items + media bytes); shared caps bound retained output and each input read.
 */
export function bufferArchiveMedia(required: { sources: readonly ArchiveMediaSource[]; blobStore: ShareBlobStore; imageTransformer: ImageTransformerPort; ledger: ShareLedger }, optional: { signal?: AbortSignal } = {}): Promise<ArchiveMediaCopy[]> {
  return bufferMedia({ ...required, host }, optional);
}
