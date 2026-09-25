/**
 * @file Public surface (barrel) for `media` — re-exported from `@jini-ai/cms/media`.
 *
 * The domain moved into the package on 2026-08-03 so a second host can use the same media
 * assets/blob-GC/transform-registry model. What is left in this directory is only what is
 * genuinely this host's:
 *
 * - `__tests__/repo.contract.test.ts` — a contract suite parameterized over BOTH the package's
 *   in-memory repos and this host's own SQLite adapters (`db/sqlite/media-repo.sqlite.ts`), so it
 *   stays here rather than moving with the domain (mirrors `identity`'s identical precedent).
 *
 * Everything else here is a re-export, and the shape of what is *not* re-exported is the point:
 * there is no SQLite adapter export on this barrel, so nothing outside the composition root can
 * accidentally depend on this host's persistence choice.
 */
export type {
  MediaStatus,
  MediaSource,
  MediaRecord,
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

export { InMemoryBlobStore, LocalFsBlobStore, type LocalFsBlobStoreDeps } from "@jini-ai/cms/media";

export {
  DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_ALLOWED_MIME_TYPES,
  resolveWriteOnceSource,
  uploadMedia,
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

export { SharpImageTransformer, ImageTransformUnavailableError, ImageSourceCorruptError } from "@jini-ai/cms/media";

export { sniffContentType, type SniffedContentType } from "@jini-ai/cms/media";

export {
  mediaAgentToolCatalog,
  type MediaAgentToolDefinition as AgentToolDefinition,
} from "@jini-ai/cms/media";

export type { MediaContentTypeStorePort } from "./content-type-store.js";
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

export { TOVU_MAX_UPLOAD_BYTES } from "./upload-limits.js";
export { resolveUploadContentType, assertAllowedSniffedContentType } from "./upload-content-type.js";

export { mediaUrlKey, mediaPublicPath, type MediaUrlKeySource, type MediaPublicPathVariant } from "./public-path.js";
