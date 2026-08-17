/**
 * @file Public surface for the `static-publish` sub-feature (ADR-009 §1). See `./types.ts`'s header
 * for why this stays a separate module tree from this directory's sibling continuous-deployment
 * feature (`../ports.ts`/`../providers/github.ts`).
 */
export type {
  CloudflarePagesPublishConfig,
  GitHubPagesPublishConfig,
  NetlifyPublishConfig,
  PublishCredentialSource,
  StaticPublishConfig,
  StaticPublishOutcome,
  StaticPublishTargetId,
  VercelPublishConfig,
} from "./types";

export {
  composePublishCredentialSource,
  createDbPublishCredentialSource,
  createEnvPublishCredentialSource,
  type ComposePublishCredentialSourceInput,
  type DbPublishCredentialSourceDeps,
} from "./credentials";

export { computeBasePath, publishStaticSite, validateStaticPublishConfig, type StaticPublishDeps, type StaticPublishInput } from "./adapter";

export {
  getPublishRunSnapshot,
  runPublishAndAwait,
  startPublishRun,
  type PublishRunSnapshot,
  type PublishRunStatus,
} from "./publish-run";

export {
  DEFAULT_PUBLISH_HISTORY_LIST_LIMIT,
  MAX_PUBLISH_HISTORY_LIST_LIMIT,
  InMemoryPublishHistoryStore,
  resolvePublishHistoryListLimit,
  type PublishHistoryEntry,
  type PublishHistoryStore,
  type PublishTrigger,
} from "./publish-history";

export {
  canYieldAccountLabel,
  extractGitHubLogin,
  InMemoryPublishCredentialVerificationCache,
  verifyPublishCredential,
  verifyPublishCredentialById,
  type PublishCredentialVerificationCache,
  type PublishCredentialVerificationResult,
  type VerifyPublishCredentialByIdDeps,
  type VerifyPublishCredentialDeps,
} from "./verify";
