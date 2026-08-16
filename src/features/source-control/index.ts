/**
 * @file Public surface for the `source-control` feature (structural mirror of
 * `features/deployments/publish-credentials/index.ts`).
 */
export type {
  BitbucketSourceControlConnectionInput,
  GitHubSourceControlConnectionInput,
  GitLabSourceControlConnectionInput,
  SourceControlConnectionInput,
  SourceControlCredentialSetRecord,
  SourceControlCredentialSetRepoPort,
  SourceControlCredentialSummary,
  SourceControlProviderId,
} from "./types";

export { buildSourceControlCredentialAad } from "./aad";

export {
  createSourceControlCredential,
  deleteSourceControlCredential,
  describeCredential,
  isUniqueLabelViolation,
  listSourceControlCredentials,
  resolveDefaultForSourceControl,
  SourceControlCredentialDuplicateLabelError,
  SourceControlCredentialNotFoundError,
  SourceControlCredentialSecretStoreUnconfiguredError,
  SourceControlCredentialValidationError,
  updateSourceControlCredential,
  type CreateSourceControlCredentialInput,
  type SourceControlCredentialReadDeps,
  type SourceControlCredentialWriteDeps,
  type UpdateSourceControlCredentialInput,
} from "./store";

export { InMemorySourceControlCredentialSetRepo } from "./repo.memory";
