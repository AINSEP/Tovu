import path from "node:path";
import { writeFileSync } from "node:fs";

import {
  buildDeploymentDescriptor,
  createDeployConfigKit,
  loadDeployConfigGeneratorsFromSource,
  type DeployConfigGeneratorRegistry,
  type RenderDeployConfigOptions,
} from "../../features/deployments/index.js";
import { resolveProductRoot, ValidationError } from "../../platform/site-dir/index.js";

/**
 * @file `tovu deploy config --target <id> --region <region> [--out <file>]` — wires parsed argv to
 * `features/deployments`'s single `DeploymentDescriptor` and the platform generators the bundled
 * `deploy` Agent Plugin ships (`content/agent-plugins/deploy/tovu-deploy-configs.json`, loaded by
 * `features/deployments/deploy-config-registry.ts`). `features/deployments/deploy-config.ts`'s own
 * header explains why there is exactly one descriptor and thin generators, never independent ones.
 *
 * Purpose:
 * `--target` is this command's own value-level validation (same pattern `theme validate`'s
 * `--profile` already establishes), against the ids the plugin declares, in declared order.
 * `--region` is NOT validated here: each generator validates it itself (presence, and — where a real
 * platform enum exists — membership), so the exact same check applies whether this CLI calls a
 * generator or a future admin route does. Prints the rendered config to stdout by default (composable
 * with shell redirection, e.g. `tovu deploy config --target <id> --region <r> > <file>`), or writes
 * it straight to `--out` when given. Every generator's own follow-up `notes` (volume creation, where
 * to set a secret's real value) print to stderr — never mixed into the file contents on stdout.
 *
 * Generators load from the product's OWN bundled plugin source, the same trust basis as the
 * hermetic composition root: the CLI runs at the repo root, with no workspace install to consult.
 *
 * Architectural role:
 * `cli` layer. Never maps errors to exit codes itself — lets `ValidationError` (bad `--target`, bad
 * `--region`) and `buildDeploymentDescriptor`'s own derivation-failure `Error` propagate uncaught to
 * `cli/main.ts`, same discipline `cli/commands/export.ts`'s own header documents.
 */

export interface RunDeployConfigCommandInput {
  target?: string;
  region?: string;
  out?: string;
}

/** The bundled `deploy` plugin's source directory. Same resolution as
 *  `server/runtime/composition/deps.ts`'s `bundledAgentPluginsDir()` (not imported: that module
 *  pulls in the whole server composition graph for one path). @complexity O(1). */
function bundledDeployPluginRoot(): string {
  return path.join(process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR ?? path.join(resolveProductRoot(), "content", "agent-plugins"), "deploy");
}

/** Loads the generators, printing any refused one to stderr so a missing `--target` is explainable.
 *  @complexity O(g) generators, one import each. */
async function loadGenerators(): Promise<DeployConfigGeneratorRegistry> {
  const registry = await loadDeployConfigGeneratorsFromSource({ pluginId: "deploy", packageRoot: bundledDeployPluginRoot() });
  for (const refusal of registry.refusals) process.stderr.write(`tovu deploy config: ${refusal}\n`);
  return registry;
}

/**
 * Run `tovu deploy config --target <t> --region <r> [--out <file>]`.
 *
 * @throws {ValidationError} an unknown `--target`, a missing/invalid `--region` (raised by the
 *   chosen generator itself, through the kit).
 * @throws {Error} `buildDeploymentDescriptor`'s own derivation-failure error, if a source file
 *   (`Dockerfile`, `fly.toml`, the readyz route) has drifted out of sync with this command's own
 *   extraction patterns.
 * @complexity O(g) generator imports, plus `buildDeploymentDescriptor`'s and the chosen generator's own bounded costs.
 */
export async function runDeployConfigCommand(input: RunDeployConfigCommandInput): Promise<void> {
  const targetRaw = input.target ?? "";
  const generators = await loadGenerators();
  const generator = generators.get(targetRaw);
  if (generator === undefined) {
    const ids = generators.list().map((loaded) => loaded.descriptor.id);
    throw new ValidationError(`--target must be one of: ${ids.join(", ")} (got "${targetRaw}")`);
  }

  const descriptor = buildDeploymentDescriptor();
  const options: RenderDeployConfigOptions = { region: input.region ?? "" };
  const rendered = generator.module.render(descriptor, options, createDeployConfigKit());

  if (input.out !== undefined) {
    const outPath = path.resolve(input.out);
    writeFileSync(outPath, rendered.contents, "utf8");
    process.stdout.write(`tovu deploy config: wrote ${rendered.filename} (${targetRaw}) to ${outPath}\n`);
  } else {
    process.stdout.write(rendered.contents);
  }

  for (const note of rendered.notes) {
    process.stderr.write(`tovu deploy config: ${note}\n`);
  }
}
