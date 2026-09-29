/**
 * @file Public surface for the `publish-credentials` sub-feature (ADR-009 §1).
 */
export type {
  PublishConnectionInput,
  PublishCredentialSetRecord,
  PublishCredentialSetRepoPort,
  PublishCredentialSummary,
  PublishProviderId,
} from "./types.js";

export { buildPublishCredentialAad } from "./aad.js";

export {
  createPublishCredential,
  deletePublishCredential,
  describeCredential,
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

export {
  createAccountLabelHealScheduler,
  idsNeedingAccountLabelHeal,
  type AccountLabelHealScheduler,
  type AccountLabelHealSchedulerDeps,
} from "./account-label-heal-scheduler.js";

export { InMemoryPublishCredentialSetRepo } from "./repo.memory.js";

export {
  copyPublishCredentialsToVendorTable,
  type VendorTableBackfillDeps,
  type VendorTableBackfillReport,
} from "./vendor-table-backfill.js";
