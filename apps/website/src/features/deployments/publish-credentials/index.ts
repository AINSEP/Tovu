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
} from "./types.js";

export { buildPublishCredentialAad } from "./aad.js";

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
} from "./store.js";

export { executionModeFromEnv, type PublishExecutionMode } from "./execution-mode.js";

export {
  createAccountLabelHealScheduler,
  idsNeedingAccountLabelHeal,
  type AccountLabelHealScheduler,
  type AccountLabelHealSchedulerDeps,
} from "./account-label-heal-scheduler.js";

export { InMemoryPublishCredentialSetRepo } from "./repo.memory.js";
