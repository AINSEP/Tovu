/**
 * @file Public surface for the `static-publish` sub-feature (ADR-009 §1). See `./types.ts`'s header
 * for why this stays a separate module tree from this directory's sibling continuous-deployment
 * feature (`../ports.ts`/`../providers/github.ts`).
 */
export type {
  GitHubPagesPublishConfig,
  PublishCredentialSource,
  StaticPublishConfig,
  StaticPublishOutcome,
  StaticPublishTargetId,
  VercelPublishConfig,
} from "./types";

export { createEnvPublishCredentialSource } from "./credentials";

export { computeBasePath, publishStaticSite, validateStaticPublishConfig, type StaticPublishDeps, type StaticPublishInput } from "./adapter";
