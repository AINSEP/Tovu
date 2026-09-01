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

export { DEPLOYMENTS_READ_LIST_LIMIT, type DeploymentsReadRepoPort } from "./read-repo.js";
export { SqliteDeploymentsReadRepo } from "./repo.sqlite.js";
export { InMemoryDeploymentsReadRepo } from "./repo.memory.js";

// `sendPinned` is intentionally NOT re-exported here — it is an internal chokepoint, exported from
// `./providers/github.ts` only so its own test can call it directly (see that file's doc comment).
//
// `static-publish/**`/`publish-credentials/**` are NOT re-exported here, deliberately. Both
// sub-directories are themselves curated "Public surface for the X sub-feature" barrels (their own
// `index.ts`, own ADR-009 §1 header, one level down — see each file's own docblock) — genuine
// nested modules, not loose internal files. Re-exporting their content through this file too was
// tried (2026-08-17 no-deep-imports:features/deployments triage) and reverted: it moved
// `check:architecture`'s propagation cost (all-import) from 11.56% to 15.36% (+3.89pts), because
// every one of this barrel's OTHER consumers — anyone reaching only `DeploymentsReadRepoPort`, say
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

// `buildDeploymentDescriptor` + the three platform renderers back `tovu deploy config --target
// <fly|render|railway>` (`cli/commands/deploy-config.ts`) — see `deploy-config.ts`'s own header for
// why this is one descriptor and three thin renderers rather than four independent generators. Each
// renderer's own region-allow-list constant is exported alongside it so the CLI layer never needs to
// duplicate that platform knowledge.
export {
  buildDeploymentDescriptor,
  type DeploymentDescriptor,
  type DeploymentSecret,
  type DeploymentTarget,
  type RenderDeployConfigOptions,
  type RenderedDeployConfig,
} from "./deploy-config.js";
export { renderFlyToml } from "./deploy-config-fly.js";
export { RENDER_VALID_REGIONS, renderRenderYaml } from "./deploy-config-render.js";
export { RAILWAY_VALID_REGIONS, renderRailwayConfig } from "./deploy-config-railway.js";

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
