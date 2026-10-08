/**
 * @file Public surface for deployments (ADR-009 §1): export, publish and plugin deploy paths.
 */
export type {
  DeploymentProviderId,
  DeploymentRunStatus,
  DeploymentTargetRecord,
  ReleaseRecord,
  ReleaseSource,
} from "./types.js";

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
} from "./ports.js";

export { GITHUB_DEPLOYMENT_PROVIDER_ID, createGitHubDeploymentProvider, mapGitHubDeploymentStatus } from "./providers/github.js";

// `sendPinned` is intentionally NOT re-exported here — it is an internal chokepoint, exported from
// `./providers/github.ts` only so its own test can call it directly (see that file's doc comment).
//
// static-publish and publish-credentials expose their own nested public barrels. Folding their
// exports into this barrel would give every unrelated consumer their full transitive dependencies.
// .dependency-cruiser.mjs registers those barrels in EXTRA_TO_EXEMPT because its generated
// no-deep-imports rule recognizes only the top-level index, not nested guarded modules.

// `ExportEngine`/`ExportRunCounts`/`ExportRunSnapshot`/`ExportRunStatus` are the shape
// `server/routes/admin/system/export-site.ts` (the one composed caller) and `server/routes/types.ts`
// (its `RouteDeps` field) need; `startExportRun`/`getExportRunSnapshot` are the two functions that
// route actually calls. `ExportRunReportLike` has no external caller today and stays un-re-exported.
export {
  getExportRunSnapshot,
  startExportRun,
  type ExportEngine,
  type ExportRunCounts,
  type ExportRunSnapshot,
  type ExportRunStatus,
} from "./export-run.js";

// `readDockerfileSource`/`writeDockerfileSource`/`writeDockerfileSourceWithIfMatch` back the admin
// Dockerfile tab's read/write routes (`server/routes/admin/system/dockerfile-source.ts`) and their
// route-level tests. `writeDockerfileSource` (the unconditional write) is kept for those tests' own
// before/after cleanup — see `dockerfile.ts`'s own doc for why the route itself uses the `-WithIfMatch`
// variant instead.
export {
  readDockerfileSource,
  writeDockerfileSource,
  writeDockerfileSourceWithIfMatch,
  type DockerfileSourceSnapshot,
} from "./dockerfile.js";

// `buildDeploymentDescriptor` + the generator port back `tovu deploy config --target <id>`
// (`cli/commands/deploy-config.ts`). The platform generators themselves are plugin modules (the
// bundled `deploy` plugin's `deploy-configs/*.mjs`), loaded by `./deploy-config-registry.ts` — see
// `deploy-config.ts`'s own header for why this is one descriptor and thin generators.
export {
  buildDeploymentDescriptor,
  createDeployConfigKit,
  type DeployConfigGeneratorModule,
  type DeployConfigKit,
  type DeploymentDescriptor,
  type DeploymentSecret,
  type RenderDeployConfigOptions,
  type RenderedDeployConfig,
} from "./deploy-config.js";
export {
  DEPLOY_CONFIGS_FILENAME,
  loadDeployConfigGeneratorsFromSource,
  readDeployConfigTargetIdsFromSource,
  type DeployConfigGeneratorDescriptor,
  type DeployConfigGeneratorRegistry,
  type LoadedDeployConfigGenerator,
} from "./deploy-config-registry.js";

// publish-agent-tools stays a dedicated tool-registration seam instead of a general barrel export,
// so unrelated consumers do not inherit its tool/composition dependencies. EXTRA_TO_EXEMPT and
// TOOL_REGISTRATION_SEAM_TO admit its registration contract tests directly.

export { loadDeployOpsRegistry } from "./deploy-ops/registry.js";
export type { DeployOpsRegistry } from "./deploy-ops/types.js";
