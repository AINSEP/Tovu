/**
 * @file Public surface for the `publish-credentials` sub-feature (ADR-009 §1).
 */
export type {
  PublishConnectionInput,
  PublishCredentialScope,
  PublishCredentialSummary,
  PublishProviderId,
} from "./types.js";

export {
  createPublishCredential,
  invalidatePublishCredentialCompatibility,
  deletePublishCredential,
  describeCredential,
  findPublishCredentialRecord,
  hasDefaultForPublish,
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
  type PublishCredentialResolveDeps,
  type PublishCredentialWriteDeps,
  type UpdatePublishCredentialInput,
} from "./store.js";

export { executionModeFromEnv, type PublishExecutionMode } from "./execution-mode.js";
export { publishHostsForCredential } from "./store.js";

export {
  createAccountLabelHealScheduler,
  idsNeedingAccountLabelHeal,
  type AccountLabelHealScheduler,
  type AccountLabelHealSchedulerDeps,
} from "./account-label-heal-scheduler.js";

export { InMemoryVendorCredentialSetRepo } from "./repo.memory.js";
