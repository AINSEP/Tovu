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
} from "./types";

export { buildCustomCredentialAad } from "./aad";

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
} from "./store";

export { InMemoryCustomCredentialSetRepo } from "./repo.memory";
