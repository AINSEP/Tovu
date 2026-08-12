/**
 * @file Public surface for the `deployments` feature (ADR-009 §1 — a module's public contract is
 * its `index.ts`).
 *
 * FIRST VERTICAL SLICE ONLY (2026-08-12) — see this feature's handoff report for what is not yet
 * built: no repository ports, no admin routes, no webhook route, no UI, no worker/reconciliation
 * loop, and no wiring into `src/server/composition`. What exists: the domain types, the
 * provider-neutral port, and one adapter (`github`) proven against a fake `HttpClientPort`.
 */
export type {
  DeploymentProviderId,
  DeploymentRunStatus,
  DeploymentRunEventRecord,
  DeploymentRunRecord,
  DeploymentTargetRecord,
  EnvironmentRecord,
  ReleaseRecord,
  ReleaseSource,
} from "./types";

export type {
  DeploymentError,
  DeploymentErrorCode,
  DeploymentProviderContext,
  DeploymentProviderPort,
  DeploymentRunStatusUpdate,
  PollDeploymentRunInput,
  PollDeploymentRunResult,
  StartDeploymentRunInput,
  StartDeploymentRunResult,
} from "./ports";

export { GITHUB_DEPLOYMENT_PROVIDER_ID, createGitHubDeploymentProvider, mapGitHubDeploymentStatus } from "./providers/github";

// `sendPinned` is intentionally NOT re-exported here — it is an internal chokepoint, exported from
// `./providers/github.ts` only so its own test can call it directly (see that file's doc comment).
