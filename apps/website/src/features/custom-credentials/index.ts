/**
 * @file Public surface for the `custom-credentials` feature (structural mirror of
 * `features/source-control/index.ts`).
 */
export {
  allowedOriginsFor,
  CUSTOM_CREDENTIAL_CATEGORIES,
  type CustomCredentialCategoryId,
  type CustomCredentialProjectScope,
  type CustomCredentialScope,
  type CustomCredentialSetRecord,
  type CustomCredentialSetRepoPort,
  type CustomCredentialSummary,
  type CustomProviderConnectionInput,
} from "./types.js";

export {
  createCustomCredential,
  CustomCredentialDuplicateLabelError,
  CustomCredentialConcurrentModificationError,
  CustomCredentialNotFoundError,
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
  deleteCustomCredential,
  describeCredential,
  describeCredentialByLabel,
  listCustomCredentials,
  listCustomCredentialInventory,
  resolveCustomCredentialByLabel,
  updateCustomCredential,
  type CreateCustomCredentialInput,
  type CustomCredentialReadDeps,
  type CustomCredentialResolveDeps,
  type CustomCredentialWriteDeps,
  type UpdateCustomCredentialInput,
} from "./store.js";

export { InMemoryCustomCredentialSetRepo } from "./repo.memory.js";
export { customVaultScope } from "./vault-repo.js";
export { summarizeCredentialSources, type CredentialCopyToolDeps } from "./credential-copy-tool.js";

export {
  ConsoleCredentialedRequestAuditLog,
  CredentialedRequestTransportError,
  CredentialedRequestValidationError,
  InMemoryCredentialedRequestAuditLog,
  makeCredentialedRequest,
  resolveRequestTarget,
  verifyCustomCredential,
  type CredentialedRequestAuditEntry,
  type CredentialedRequestAuditPort,
  type CredentialedRequestDeclinedResult,
  type CredentialedRequestDeps,
  type CredentialedRequestExecutedResult,
  type CredentialedRequestOutcome,
  type CustomCredentialCheckStatus,
  type CustomCredentialVerificationResult,
  type MakeCredentialedRequestInput,
} from "./credentialed-request.js";
