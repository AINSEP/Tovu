import { bundledContributionSources } from "../agent-plugins/bundled-contribution-sources.js";
import { defineExecutablePluginContribution, loadPluginContributionsFromSource, type LoadPluginContributions, type TrustedPluginPackage } from "../agent-plugins/lifecycle.js";

import type { DeployConfigGeneratorDescriptor, DeployConfigGeneratorModule } from "@jini-ai/devops/deploy";
import { createDeployConfigGeneratorSource, type LoadDeployWorkflowContributions } from "@jini-ai/devops/deploy/site/deploy-config-registry";

// The generator descriptor, loaded-generator and registry shapes live in `@jini-ai/devops/deploy`;
// this path keeps the host's binding only.

/**
 * @file Tovu's binding of `@jini-ai/devops/deploy/site/deploy-config-registry`: the generators behind
 * `tovu deploy config --target <id>` load from an Agent Plugin, so core names no hosting vendor. This
 * file injects the product-named manifest ({@link DEPLOY_CONFIGS_FILENAME}), the bundled source lister
 * (`../agent-plugins/bundled-contribution-sources.ts`), the agent-plugins contribution seam
 * (`../agent-plugins/lifecycle.ts`) and the refusal logger. A plugin opts in by shipping
 * {@link DEPLOY_CONFIGS_FILENAME} at its root: `{ schemaVersion: 1, generators: [{ id, label, module }] }`,
 * in the order the CLI lists them. Each `module` is a plain-JS `.mjs` file inside the plugin whose
 * default export is a `DeployConfigGeneratorModule` (`./deploy-config.ts`).
 *
 * Only the SOURCE loader exists today: its one caller, the CLI, runs at the repo root and reads the
 * product's own bundled `content/agent-plugins/<id>/`, the same trust basis as the hermetic
 * composition root. Module imports still go through the shared containment gate
 * (`Jini packages/agent-plugins/src/lifecycle/trusted-plugin-files.ts`). A workspace-installed variant (activation +
 * bundled-digest gates, like `deploy-targets/registry.ts`) is added when an admin route needs one.
 *
 * Failure isolation: a bad manifest drops the plugin's generators, a bad module only itself; every
 * drop is reported in `refusals`, never thrown. Cross-package duplicate ids are refused for all
 * claimants, never silently overwritten.
 *
 * Architectural role: `features/deployments` capability, read by `cli/commands/deploy-config.ts`.
 */

/** The file a plugin ships at its root to contribute deploy-config generators. */
export const DEPLOY_CONFIGS_FILENAME = "jini-deploy-configs.json";

/**
 * Tovu's bound deploy-config generator source. Members:
 * - `loadDeployConfigGeneratorsFromSource`: the generators a plugin's SOURCE directory declares, with no
 *   install, activation or digest gate. Only for this product's own `content/agent-plugins/<id>/` (the
 *   CLI, tests): never point it at anything an operator or a third party can write. O(g) generators,
 *   one import each.
 * - `readDeployConfigTargetIdsFromSource`: declared generator ids of one plugin source, without
 *   importing modules. O(g).
 * - `loadBundledDeployConfigGenerators`: all bundled generators in plugin-id order; refuse every
 *   cross-package duplicate. O(p + generators), one contained import per generator.
 * - `readBundledDeployConfigTargetIds`: sync CLI help uses the same source selection and duplicate
 *   policy, without importing modules.
 * - `readBundledDeployConfigDescriptors`: unambiguous bundled descriptors, without importing modules.
 * - `readBundledDeployConfigCandidatePaths`: ordered deploy suggestions; app.json remains the core's
 *   neutral convention.
 * - `readBundledDeployWorkflowFile`: host supplies the single declared workflow to an ops adapter;
 *   ambiguity never guesses.
 * - `readBundledDeployWorkflowFiles`: hermetic roots use shipped sources; production uses
 *   {@link loadDeployWorkflowFiles}. O(descriptors).
 */
export const deployConfigGenerators = createDeployConfigGeneratorSource<TrustedPluginPackage, ReturnType<typeof defineExecutablePluginContribution<DeployConfigGeneratorDescriptor, DeployConfigGeneratorModule>>>({
  filename: DEPLOY_CONFIGS_FILENAME,
  contributionSources: (required) => bundledContributionSources(required),
  defineExecutableContribution: (spec, optional) => defineExecutablePluginContribution<DeployConfigGeneratorDescriptor, DeployConfigGeneratorModule>(spec, optional),
  loadFromSource: (input) => loadPluginContributionsFromSource(input),
  warn: (line) => console.warn(line),
});

/** Installed workflow hints use the same active, trusted lifecycle as deploy ops, without imports. */
export function loadDeployWorkflowFiles(required: { workspaceId: string; loadContributions: LoadPluginContributions }, _options = {}): Promise<readonly string[]> {
  const loadContributions: LoadDeployWorkflowContributions = (input, optional) => required.loadContributions(input, optional);
  return deployConfigGenerators.loadDeployWorkflowFiles({ workspaceId: required.workspaceId, loadContributions });
}
