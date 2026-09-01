/**
 * @file Public surface for the `custom-credentials` feature (structural mirror of
 * `features/source-control/index.ts`).
 */
export {
  CUSTOM_CREDENTIAL_CATEGORIES,
  type CustomCredentialCategoryId,
  type CustomCredentialSetRecord,
  type CustomCredentialSetRepoPort,
  type CustomCredentialSummary,
  type CustomProviderConnectionInput,
} from "./types.js";

export { buildCustomCredentialAad } from "./aad.js";

export {
  createCustomCredential,
  CustomCredentialDuplicateLabelError,
  CustomCredentialNotFoundError,
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
  deleteCustomCredential,
  describeCredential,
  isUniqueLabelViolation,
  listCustomCredentials,
  resolveCustomCredentialByLabel,
  updateCustomCredential,
  type CreateCustomCredentialInput,
  type CustomCredentialReadDeps,
  type CustomCredentialResolveDeps,
  type CustomCredentialWriteDeps,
  type UpdateCustomCredentialInput,
} from "./store.js";

export { InMemoryCustomCredentialSetRepo } from "./repo.memory.js";

export {
  ConsoleCredentialedRequestAuditLog,
  CredentialedRequestTransportError,
  CredentialedRequestValidationError,
  InMemoryCredentialedRequestAuditLog,
  makeCredentialedRequest,
  verifyCustomCredential,
  type CredentialedRequestAuditEntry,
  type CredentialedRequestAuditPort,
  type CredentialedRequestDeps,
  type CredentialedRequestResult,
  type CustomCredentialVerificationResult,
  type MakeCredentialedRequestInput,
} from "./credentialed-request.js";
