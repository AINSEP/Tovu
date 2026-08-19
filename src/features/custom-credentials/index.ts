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
  updateCustomCredential,
  type CreateCustomCredentialInput,
  type CustomCredentialReadDeps,
  type CustomCredentialWriteDeps,
  type UpdateCustomCredentialInput,
} from "./store.js";

export { InMemoryCustomCredentialSetRepo } from "./repo.memory.js";
