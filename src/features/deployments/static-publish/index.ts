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
} from "./types.js";

export {
  composePublishCredentialSource,
  createDbPublishCredentialSource,
  createEnvPublishCredentialSource,
  type ComposePublishCredentialSourceInput,
  type DbPublishCredentialSourceDeps,
} from "./credentials.js";

export { computeBasePath, publishStaticSite, validateStaticPublishConfig, type StaticPublishDeps, type StaticPublishInput } from "./adapter.js";

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
  extractGitHubLogin,
  InMemoryPublishCredentialVerificationCache,
  verifyPublishCredential,
  verifyPublishCredentialById,
  type PublishCredentialVerificationCache,
  type PublishCredentialVerificationResult,
  type VerifyPublishCredentialByIdDeps,
  type VerifyPublishCredentialDeps,
} from "./verify.js";

// Exported through this sub-feature's own public door (ADR-009 §1) rather than reached into
// directly: `publish-site-route.test.ts` needs the SAME alias table `credentials.ts` resolves
// tokens from, so a "no credentials configured" fixture can clear every name the product actually
// reads instead of keeping a second, driftable copy. A real GITHUB_ACCESS_TOKEN/VERCEL_ACCESS_TOKEN
// left set in a dev shell silently flipped those fixtures to "configured" once the alias list grew
// past its original one-name-per-target shape. Importing `./credentials.js` from outside is a
// `no-deep-imports:features/deployments` error -- only this index.ts is an exempted door.
export { CLOUDFLARE_ACCOUNT_ID_ENV_VAR, ENV_VAR_ALIASES_BY_TARGET } from "./credentials.js";
