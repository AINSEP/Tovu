/**
 * @file Public surface (barrel) for the `media` library (ADR-027).
 *
 * See `types.ts` and `media-service.ts` file headers for the disclosed scope
 * adjustments this walking-skeleton build makes relative to the full ADR-027
 * design (bespoke table instead of generic entries; no transform registry,
 * origin isolation, or ingress policy). Blob GC (`blob-gc.ts`) IS built for
 * real within its own disclosed scope — see that file's header for what's
 * still stubbed (`entry_refs`, retained snapshots, the monthly orphan sweep).
 */
export type {
  MediaStatus,
  MediaSource,
  MediaRecord,
  AssetBlobStatus,
  AssetBlobRecord,
  AssetRenditionRecord,
  BlobGcJournalEntry,
} from "./types";

export {
  MediaNotFoundError,
  MediaValidationError,
  MediaConflictError,
  MediaSourceImmutableError,
  MediaStillReferencedError,
} from "./types";

export type {
  MediaRepoPort,
  AssetBlobRepoPort,
  AssetRenditionRepoPort,
  BlobStorePort,
  BlobGcJournalRepoPort,
  PutBlobInput,
  TransformDefinitionRepoPort,
} from "./ports";

export { computeBlobStorageKey } from "./blob-key";

export {
  InMemoryMediaRepo,
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryBlobGcJournalRepo,
  InMemoryTransformDefinitionRepo,
} from "./repo.memory";

export { withSha256Lock } from "./blob-gc-lock";

export {
  DEFAULT_GC_GRACE_MS,
  resolveGcGraceMs,
  isBlobUnreferenced,
  tombstoneBlobIfUnreferenced,
  runBlobGcDeletePass,
  runBlobGcUnlinkPass,
  runBlobGcCycle,
  runMonthlyOrphanSweepStub,
} from "./blob-gc";

export { InMemoryBlobStore } from "./blob-store.memory";
export { LocalFsBlobStore, type LocalFsBlobStoreDeps } from "./blob-store.fs";

export {
  DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_ALLOWED_MIME_TYPES,
  resolveWriteOnceSource,
  uploadMedia,
  listMedia,
  getMediaById,
  updateMediaMetadata,
  trashMedia,
  purgeMedia,
  type UploadMediaInput,
  type UploadMediaDeps,
  type UpdateMediaMetadataInput,
} from "./media-service";

// -----------------------------------------------------------------------------
// Named transform registry + rendition generation (ADR-027 §4) — new in this
// task. See `transform-types.ts`, `transform-registry.ts`,
// `rendition-service.ts`, `image-transformer*.ts` file headers for the
// disclosed scope: core-declared transforms only, in-process lazy
// single-flight generation only (no eager hot-set worker, no out-of-process
// generation, no theme/plugin declaration API).
// -----------------------------------------------------------------------------
export type {
  TransformFit,
  TransformFormat,
  TransformParams,
  TransformDefinitionRecord,
} from "./transform-types";
export { TransformValidationError, mimeForTransformFormat, MAX_TRANSFORM_DIMENSION_PX } from "./transform-types";

export { withRenditionLock, withTransformRegistryLock } from "./transform-lock";

export {
  registerTransform,
  getLatestTransformDefinition,
  isLatestTransformVersion,
  isReferencedByPublishedContent,
  type RegisterTransformInput,
  type RegisterTransformDeps,
} from "./transform-registry";

export {
  resolveMediaRendition,
  type ResolveMediaRenditionDeps,
  type ResolveMediaRenditionInput,
  type ResolveMediaRenditionResult,
} from "./rendition-service";

export type { ImageTransformerPort, TransformImageInput, TransformImageOutput } from "./image-transformer";
export { InMemoryImageTransformer } from "./image-transformer";

export { SharpImageTransformer, ImageTransformUnavailableError } from "./image-transformer.sharp";

// -----------------------------------------------------------------------------
// Original-bytes admin preview route support — new in this task. See
// `content-type-sniffer.ts`'s file header for the disclosed scope: an allowlist
// magic-byte sniffer, not a general-purpose one.
// -----------------------------------------------------------------------------
export { sniffContentType, type SniffedContentType } from "./content-type-sniffer";
