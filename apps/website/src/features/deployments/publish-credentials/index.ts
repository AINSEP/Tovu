/**
 * @file Public surface for the `publish-credentials` sub-feature (ADR-009 §1).
 */
export {
  createPublishCredential,
  invalidatePublishCredentialCompatibility,
  deletePublishCredential,
  describeCredential,
  findPublishCredentialRecord,
  hasDefaultForPublish,
  healAccountLabel,
  listPublishCredentials,
  PublishCredentialDuplicateLabelError,
  PublishCredentialNotFoundError,
  PublishCredentialSecretStoreUnconfiguredError,
  PublishCredentialValidationError,
  resolveDefaultForPublish,
  resolveForPublish,
  updatePublishCredential,
  type CreatePublishCredentialInput,
  type PublishCredentialReadDeps,
  type PublishCredentialResolveDeps,
  type PublishCredentialWriteDeps,
  type UpdatePublishCredentialInput,
} from "./store.js";

export { publishHostsForCredential } from "./store.js";

export { bindPublishCompatibility, type PublishCompatibilitySource } from "./compatibility-port.js";
