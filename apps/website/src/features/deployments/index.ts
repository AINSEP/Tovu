/**
 * @file Public surface for deployments (ADR-009 §1). Export, publish and plugin deploy paths stay
 * live; the never-written deployment table reader was retired on 2026-10-03.
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

// Deployment read repositories removed with the unused tables (2026-10-03).

// `sendPinned` is intentionally NOT re-exported here — it is an internal chokepoint, exported from
// `./providers/github.ts` only so its own test can call it directly (see that file's doc comment).
//
// `static-publish/**`/`publish-credentials/**` are NOT re-exported here, deliberately. Both
// sub-directories are themselves curated "Public surface for the X sub-feature" barrels (their own
// `index.ts`, own ADR-009 §1 header, one level down — see each file's own docblock) — genuine
// nested modules, not loose internal files. Re-exporting their content through this file too was
// tried (2026-08-17 no-deep-imports:features/deployments triage) and reverted: it moved
// `check:architecture`'s propagation cost (all-import) from 11.56% to 15.36% (+3.89pts), because
// every one of this barrel's OTHER consumers — anyone reaching only `ExportEngine`, say
// — would have inherited both sub-features' entire transitive graph too. `static-publish/index.ts`
// and `publish-credentials/index.ts` are registered as their own doors in `EXTRA_TO_EXEMPT` in
// `.dependency-cruiser.mjs` instead — the `no-deep-imports:features/deployments` generator only
// special-cases the top-level `index.ts` (it has no first-class concept of a nested guarded
// sub-module), so this is that registration filling the gap, not a policy exception.

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

// `buildStaticPublishRegistrations`/`StaticPublishToolDeps` (`./publish-agent-tools.ts`) are NOT
// re-exported here — that file itself imports `RouteDeps` from `server/routes/types.ts` (the
// ~22-landing-import god-type; see `assistant/index.ts`'s own header for the same hazard measured
// there). Routing it through this barrel would transitively hand routes/types.ts's entire reachable
// set to every OTHER consumer of this barrel too — tried and reverted (2026-08-17
// no-deep-imports:features/deployments triage): propagation cost (all-import) barely moved off
// 15%+ until this one export was pulled back out. `publish-agent-tools.ts` is registered in
// `EXTRA_TO_EXEMPT` in `.dependency-cruiser.mjs` instead, the same treatment as the
// `static-publish`/`publish-credentials` sub-barrels above — it is also this module's own
// `tool-registrations`/`agent-tools` seam file by name (`TOOL_REGISTRATION_SEAM_TO` already
// recognizes it), so a direct reach from its two dedicated test consumers is the same
// "contract test needs the real registration builder" shape every other domain's tool-registrations
// seam already gets.

export { loadDeployOpsRegistry } from "./deploy-ops/registry.js";
export type { DeployOpsRegistry } from "./deploy-ops/types.js";
