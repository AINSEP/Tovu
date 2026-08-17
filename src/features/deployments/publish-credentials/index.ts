/**
 * @file Public surface for the `publish-credentials` sub-feature (ADR-009 §1).
 */
export type {
  CloudflarePagesConnectionInput,
  GitHubPagesConnectionInput,
  NetlifyConnectionInput,
  PublishConnectionInput,
  PublishCredentialSetRecord,
  PublishCredentialSetRepoPort,
  PublishCredentialSummary,
  PublishProviderId,
  VercelConnectionInput,
} from "./types";

export { buildPublishCredentialAad } from "./aad";

export {
  createPublishCredential,
  deletePublishCredential,
  describeCredential,
  healAccountLabel,
  isUniqueLabelViolation,
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
  type PublishCredentialWriteDeps,
  type UpdatePublishCredentialInput,
} from "./store";

export { executionModeFromEnv, type PublishExecutionMode } from "./execution-mode";

export { InMemoryPublishCredentialSetRepo } from "./repo.memory";
