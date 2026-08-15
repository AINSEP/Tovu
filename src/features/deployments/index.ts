/**
 * @file Public surface for the `deployments` feature (ADR-009 §1 — a module's public contract is
 * its `index.ts`).
 *
 * 2026-08-15: the READ side of the "no repository ports, no admin routes" gap the first-slice
 * header used to describe here is now closed — `DeploymentsReadRepoPort` +
 * `SqliteDeploymentsReadRepo`/`InMemoryDeploymentsReadRepo` are wired into `RouteDeps` and read by
 * `server/routes/admin/deployments/list.ts`. Still not built: any WRITE path (create
 * environment/target, start a run — blocked on the credential storage `./ports.ts`'s header
 * discloses), the webhook route, worker/reconciliation loop, and the `startRun`/`pollRun` provider
 * calls actually being invoked by anything.
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

export { DEPLOYMENTS_READ_LIST_LIMIT, type DeploymentsReadRepoPort } from "./read-repo";
export { SqliteDeploymentsReadRepo } from "./repo.sqlite";
export { InMemoryDeploymentsReadRepo } from "./repo.memory";

// `sendPinned` is intentionally NOT re-exported here — it is an internal chokepoint, exported from
// `./providers/github.ts` only so its own test can call it directly (see that file's doc comment).
