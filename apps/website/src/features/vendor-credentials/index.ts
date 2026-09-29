/**
 * @file Public surface for the `vendor-credentials` feature (ADR-009 §1) — structural mirror of
 * `features/deployments/publish-credentials/index.ts`/`features/source-control/index.ts`. Re-exports
 * the new table's own CRUD/resolve contract (`store.ts`). Legacy publish rows are copied into this
 * table at boot (`deployments/publish-credentials/vendor-table-backfill.ts`), so nothing reads two tables.
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
export { SOURCE_CONTROL_PROVIDER_TO_VENDOR, VENDOR_IDS } from "./types.js";

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

export { InMemoryVendorCredentialSetRepo } from "./repo.memory.js";
