/**
 * @file Public surface for the `static-publish` sub-feature (ADR-009 §1). See `./types.ts`'s header
 * for why this stays a separate module tree from this directory's sibling continuous-deployment
 * feature (`../ports.ts`/`../providers/github.ts`).
 */
export type { PublishCredentialSource, StaticPublishConfig, StaticPublishOutcome, StaticPublishTargetId } from "./types.js";

export {
  composePublishCredentialSource,
  createDbPublishCredentialSource,
  createEnvPublishCredentialSource,
  type ComposePublishCredentialSourceInput,
  type DbPublishCredentialSourceDeps,
} from "./credentials.js";

export {
  missingRequiredFieldMessage,
  planStaticPublish,
  publishStaticSite,
  readStaticPublishConfig,
  unknownTargetMessage,
  type StaticPublishDeps,
  type StaticPublishInput,
  type StaticPublishPlan,
} from "./adapter.js";

export {
  getPublishRunSnapshot,
  runPublishAndAwait,
  startPublishRun,
  type PublishRunSnapshot,
  type PublishRunStatus,
} from "./publish-run.js";

export {
  InMemoryPublishHistoryStore,
  type PublishHistoryEntry,
  type PublishHistoryStore,
  type PublishTrigger,
} from "./publish-history.js";

export {
  canYieldAccountLabel,
  InMemoryPublishCredentialVerificationCache,
  verifyPublishCredential,
  verifyPublishCredentialById,
  type PublishCredentialVerificationCache,
  type PublishCredentialVerificationResult,
  type VerifyPublishCredentialByIdDeps,
  type VerifyPublishCredentialDeps,
} from "./verify.js";
