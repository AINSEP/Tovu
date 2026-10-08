/**
 * @file Public surface (barrel) for `media` — re-exported from `@jini-ai/cms/media`.
 *
 * Jini owns media assets, blob GC and transforms; the exports below also expose Tovu's adapters.
 * `__tests__/repo.contract.test.ts` stays host-owned because it exercises both package memory
 * repos and site SQLite adapters. This barrel omits SQLite so consumers cannot accidentally
 * depend on the host's persistence choice.
 */
export type {
  MediaStatus,
  MediaSource,
  AssetBlobStatus,
  AssetBlobRecord,
  AssetRenditionRecord,
  BlobGcJournalEntry,
} from "@jini-ai/cms/media";

export {
  MediaNotFoundError,
  MediaValidationError,
  MediaConflictError,
  MediaSourceImmutableError,
  MediaStillReferencedError,
} from "@jini-ai/cms/media";

export type {
  MediaRepoPort,
  AssetBlobRepoPort,
  AssetRenditionRepoPort,
  BlobStorePort,
  BlobGcJournalRepoPort,
  PutBlobInput,
  TransformDefinitionRepoPort,
} from "@jini-ai/cms/media";

export { computeBlobStorageKey } from "@jini-ai/cms/media";

export {
  InMemoryMediaRepo,
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryBlobGcJournalRepo,
  InMemoryTransformDefinitionRepo,
} from "@jini-ai/cms/media";

export { withSha256Lock } from "@jini-ai/cms/media";

export {
  DEFAULT_GC_GRACE_MS,
  resolveGcGraceMs,
  isBlobUnreferenced,
  tombstoneBlobIfUnreferenced,
  runBlobGcDeletePass,
  runBlobGcUnlinkPass,
  runBlobGcCycle,
  runMonthlyOrphanSweepStub,
} from "@jini-ai/cms/media";

export { InMemoryBlobStore } from "@jini-ai/cms/media";
export { LocalFsBlobStore, type LocalFsBlobStoreDeps } from "@jini-ai/cms/media/node";

export {
  DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_ALLOWED_MIME_TYPES,
  resolveWriteOnceSource,
  listMedia,
  getMediaById,
  findMediaByIdOrSlug,
  updateMediaMetadata,
  trashMedia,
  purgeMedia,
  isValidMediaSlugFormat,
  type UploadMediaInput,
  type UploadMediaDeps,
  type UpdateMediaMetadataInput,
  type FindMediaByIdOrSlugRequired,
} from "@jini-ai/cms/media";

export type {
  TransformFit,
  TransformFormat,
  TransformParams,
  TransformDefinitionRecord,
} from "@jini-ai/cms/media";
export { TransformValidationError, mimeForTransformFormat, MAX_TRANSFORM_DIMENSION_PX } from "@jini-ai/cms/media";

export { withRenditionLock, withTransformRegistryLock } from "@jini-ai/cms/media";

export {
  registerTransform,
  getLatestTransformDefinition,
  isLatestTransformVersion,
  isReferencedByPublishedContent,
  type RegisterTransformInput,
  type RegisterTransformDeps,
} from "@jini-ai/cms/media";

export {
  resolveMediaRendition,
  type ResolveMediaRenditionDeps,
  type ResolveMediaRenditionInput,
  type ResolveMediaRenditionResult,
} from "@jini-ai/cms/media";

export type { ImageTransformerPort, TransformImageInput, TransformImageOutput } from "@jini-ai/cms/media";
export { InMemoryImageTransformer } from "@jini-ai/cms/media";

export { SharpImageTransformer, ImageTransformUnavailableError, ImageSourceCorruptError } from "@jini-ai/cms/media/node";

export { sniffContentType, type SniffedContentType } from "@jini-ai/cms/media";

export { mediaAgentToolCatalog } from "@jini-ai/cms/media";
export type { AgentToolDefinition } from "@jini-ai/core";

export type { MediaContentTypeStorePort } from "./content-type-store.js";
// Jini owns upload validation, dedup, GC locking, renditions and immutable creation attribution.
export { uploadMedia } from "@jini-ai/cms/media";
export type { MediaRecord } from "@jini-ai/cms/media";
export { InMemoryMediaContentTypeStore } from "./content-type-store.js";

export type { VersionedMediaRepoPort } from "./versioned-media-repo.js";
export { InMemoryVersionedMediaRepo } from "./versioned-media-repo.js";

export type {
  MediaProviderCredentialRepoPort,
  MediaProviderCredentialResolveDeps,
  ResolvedMediaProviderCredential,
} from "./provider-credential-store.js";
export {
  MediaProviderCredentialSecretStoreUnconfiguredError,
  MediaProviderCredentialValidationError,
  getMediaProviderCredentials,
  resolveMediaProviderCredential,
  saveMediaProviderCredentials,
} from "./provider-credential-store.js";

export { CORE_PUBLIC_TRANSFORM_NAME } from "./bootstrap.js";

export { S3BlobStore, type S3BlobStoreConfig } from "./blob-store.s3.js";

export { TOVU_MAX_UPLOAD_BYTES } from "../../contracts/core/upload-limits.js";
export { resolveUploadContentType, assertAllowedSniffedContentType } from "./upload-content-type.js";

export { mediaUrlKey, mediaPublicPath, type MediaUrlKeySource, type MediaPublicPathVariant } from "./public-path.js";
