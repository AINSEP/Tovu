/**
 * @file Public surface for deployments (ADR-009 §1): export, publish and plugin deploy paths.
 */
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

// static-publish and publish-credentials expose their own nested public barrels. Folding their
// exports into this barrel would give every unrelated consumer their full transitive dependencies.
// .dependency-cruiser.mjs registers those barrels in EXTRA_TO_EXEMPT because its generated
// no-deep-imports rule recognizes only the top-level index, not nested guarded modules.

// `buildDeploymentDescriptor` + the generator port back `tovu deploy config --target <id>`
// (`cli/commands/deploy-config.ts`). The platform generators themselves are plugin modules (the
// bundled hosting plugins' `deploy-configs/*.mjs`), loaded by `./deploy-config-registry.ts` — see
// `deploy-config.ts`'s own header for why this is one descriptor and thin generators.
export {
  appendHostDeployNotes,
  buildDeploymentDescriptor,
  createDeployConfigKit,
  HOST_DEPLOY_ENV,
  type DeployConfigGeneratorModule,
  type DeployConfigKit,
  type DeploymentDescriptor,
  type HostDeployNotesPorts,
  type DeploymentSecret,
  type RenderDeployConfigOptions,
  type RenderedDeployConfig,
} from "./deploy-config.js";
export {
  DEPLOY_CONFIGS_FILENAME,
  readBundledDeployConfigDescriptors,
  readBundledDeployConfigCandidatePaths,
  readBundledDeployWorkflowFile,
  readBundledDeployWorkflowFiles,
  loadDeployWorkflowFiles,
  loadDeployConfigGeneratorsFromSource,
  loadBundledDeployConfigGenerators,
  readBundledDeployConfigTargetIds,
  readDeployConfigTargetIdsFromSource,
  type DeployConfigGeneratorDescriptor,
  type DeployConfigGeneratorRegistry,
  type LoadedDeployConfigGenerator,
} from "./deploy-config-registry.js";

// publish-agent-tools stays a dedicated tool-registration seam instead of a general barrel export,
// so unrelated consumers do not inherit its tool/composition dependencies. EXTRA_TO_EXEMPT and
// TOOL_REGISTRATION_SEAM_TO admit its registration contract tests directly.

export type { DeployOpsRegistry } from "@jini-ai/devops/deploy";
