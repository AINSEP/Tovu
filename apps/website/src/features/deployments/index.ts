/**
 * @file Public surface for deployments (ADR-009 §1): export, publish and plugin deploy paths.
 */
// The provider-neutral deployment port types (`DeploymentProviderPort`, `DeploymentProviderContext`, …)
// live in `@jini-ai/devops/deploy/site/ports`, generic over the host's HTTP client type; a consumer
// imports them there and pins Tovu's `HttpClientPort` (`#src/platform/http/index`) as the type argument.

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
  type HostDeployNotesPorts,
} from "./deploy-config.js";
export {
  DEPLOY_CONFIGS_FILENAME,
  loadDeployWorkflowFiles,
  deployConfigGenerators,
} from "./deploy-config-registry.js";

// publish-agent-tools stays a dedicated tool-registration seam instead of a general barrel export,
// so unrelated consumers do not inherit its tool/composition dependencies. EXTRA_TO_EXEMPT and
// TOOL_REGISTRATION_SEAM_TO admit its registration contract tests directly.

export type {
  DeployConfigGeneratorDescriptor,
  DeployConfigGeneratorModule,
  DeployConfigGeneratorRegistry,
  DeployConfigKit,
  DeploymentDescriptor,
  DeploymentSecret,
  DeployOpsRegistry,
  LoadedDeployConfigGenerator,
  RenderDeployConfigOptions,
  RenderedDeployConfig,
} from "@jini-ai/devops/deploy";
