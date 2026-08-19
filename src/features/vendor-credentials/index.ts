/**
 * @file Public surface for the `vendor-credentials` feature (ADR-009 §1) — structural mirror of
 * `features/deployments/publish-credentials/index.ts`/`features/source-control/index.ts`. Re-exports
 * the new table's own CRUD/resolve contract (`store.ts`) plus, ADDITIONALLY to its two mirrored
 * siblings, the Phase 3 dual-read seam (`dual-read.ts`) that lets a caller resolve a vendor's default
 * credential without regressing an install whose legacy rows have not been backfilled yet — see that
 * file's own header for the full design and why it is intentionally temporary.
 */
export type {
  BitbucketVendorConnectionInput,
  CloudflareVendorConnectionInput,
  GitHubVendorConnectionInput,
  GitLabVendorConnectionInput,
  NetlifyVendorConnectionInput,
  S3CompatibleVendorConnectionInput,
  VendorConnectionInput,
  VendorCredentialSetRecord,
  VendorCredentialSetRepoPort,
  VendorCredentialSetSummary,
  VendorId,
  VercelVendorConnectionInput,
} from "./types.js";
export { PUBLISH_PROVIDER_TO_VENDOR, SOURCE_CONTROL_PROVIDER_TO_VENDOR, VENDOR_IDS } from "./types.js";

export { buildVendorCredentialAad } from "./aad.js";

export {
  createVendorCredential,
  deleteVendorCredential,
  describeCredential,
  healAccountLabel,
  isUniqueLabelViolation,
  listVendorCredentials,
  resolveDefaultForVendor,
  resolveForVendor,
  updateVendorCredential,
  VendorCredentialDuplicateLabelError,
  VendorCredentialNotFoundError,
  VendorCredentialSecretStoreUnconfiguredError,
  VendorCredentialValidationError,
  type CreateVendorCredentialInput,
  type UpdateVendorCredentialInput,
  type VendorCredentialReadDeps,
  type VendorCredentialWriteDeps,
} from "./store.js";

export {
  resolveDefaultForVendorDualRead,
  type VendorCredentialDualReadDeps,
  type VendorCredentialDualReadResult,
  type VendorCredentialDualReadSource,
} from "./dual-read.js";

export { InMemoryVendorCredentialSetRepo } from "./repo.memory.js";
