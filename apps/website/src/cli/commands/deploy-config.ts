import path from "node:path";
import { writeFileSync } from "node:fs";

import {
  buildDeploymentDescriptor,
  createDeployConfigKit,
  loadBundledDeployConfigGenerators,
  readBundledDeployConfigTargetIds,
  type DeployConfigGeneratorRegistry,
  type RenderDeployConfigOptions,
} from "../../features/deployments/index.js";
import { resolveProductRoot, ValidationError } from "../../platform/site-dir/index.js";

/**
 * @file `tovu deploy config --target <id> --region <region> [--out <file>]` — wires parsed argv to
 * `features/deployments`'s single `DeploymentDescriptor` and the platform generators the bundled
 * hosting Agent Plugins ship (`content/agent-plugins/<id>/tovu-deploy-configs.json`, loaded by
 * `features/deployments/deploy-config-registry.ts`). `features/deployments/deploy-config.ts`'s own
 * header explains why there is exactly one descriptor and thin generators, never independent ones.
 *
 * Purpose:
 * `--target` is this command's own value-level validation (same pattern `theme validate`'s
 * `--profile` already establishes), against the ids the plugins declare, in plugin-id order.
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

/** The bundled hosting plugins' source root. Same resolution as
 *  `server/runtime/composition/deps.ts`'s `bundledAgentPluginsDir()` (not imported: that module
 *  pulls in the whole server composition graph for one path). @complexity O(1). */
function bundledDeploySourceRoot(env: NodeJS.ProcessEnv): string {
  return env.TOVU_BUNDLED_AGENT_PLUGINS_DIR ?? path.join(resolveProductRoot(), "content", "agent-plugins");
}

/** Injectable effects of the deploy-config command; defaults are the process env and stdio. */
export interface DeployConfigCommandPorts {
  env?: NodeJS.ProcessEnv;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
}

function writeStdout(message: string): void {
  process.stdout.write(message);
}

function writeStderr(message: string): void {
  process.stderr.write(message);
}

/**
 * The `--target` option's help text, built from the ids the bundled hosting plugins declare
 * (e.g. "deploy platform: host-a, host-b, or host-c"). Sync: `cli/program.ts` builds help text before
 * any command runs. Falls back to a generic line when the plugins declare none.
 *
 * @complexity O(g) in the declared generator count.
 */
export function deployConfigTargetOptionHelp({ env = process.env }: Pick<DeployConfigCommandPorts, "env"> = {}): string {
  try {
    return formatTargetOptionHelp(readBundledDeployConfigTargetIds({ sourceRoot: bundledDeploySourceRoot(env) }));
  } catch { return formatTargetOptionHelp([]); }
}

/** "a", "a or b", "a, b, or c". Pure (exported for its own tests). @complexity O(g). */
export function formatTargetOptionHelp(ids: readonly string[]): string {
  if (ids.length === 0) return "deploy platform id declared by bundled plugins";
  if (ids.length <= 2) return `deploy platform: ${ids.join(" or ")}`;
  return `deploy platform: ${ids.slice(0, -1).join(", ")}, or ${ids[ids.length - 1]}`;
}

/** Loads the generators, printing any refused one to stderr so a missing `--target` is explainable.
 *  @complexity O(g) generators, one import each. */
async function loadGenerators(env: NodeJS.ProcessEnv, stderr: (message: string) => void): Promise<DeployConfigGeneratorRegistry> {
  const registry = await loadBundledDeployConfigGenerators({ sourceRoot: bundledDeploySourceRoot(env) });
  for (const refusal of registry.refusals) stderr(`tovu deploy config: ${refusal}\n`);
  return registry;
}

/**
 * Run `tovu deploy config --target <t> --region <r> [--out <file>]`.
 *
 * @throws {ValidationError} an unknown `--target`, a missing/invalid `--region` (raised by the
 *   chosen generator itself, through the kit).
 * @throws {Error} `buildDeploymentDescriptor`'s own derivation-failure error, if a source file
 *   (`Dockerfile`, a generated host config, the readyz route) has drifted out of sync with this command's own
 *   extraction patterns.
 * @complexity O(g) generator imports, plus `buildDeploymentDescriptor`'s and the chosen generator's own bounded costs.
 */
export async function runDeployConfigCommand(input: RunDeployConfigCommandInput, optional: DeployConfigCommandPorts = {}): Promise<void> {
  // Default ports are wired here, at the command edge; tests inject their own.
  const { env = process.env, stdout = writeStdout, stderr = writeStderr } = optional;
  const targetRaw = input.target ?? "";
  const generators = await loadGenerators(env, stderr);
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
    stdout(`tovu deploy config: wrote ${rendered.filename} (${targetRaw}) to ${outPath}\n`);
  } else {
    stdout(rendered.contents);
  }

  for (const note of rendered.notes) {
    stderr(`tovu deploy config: ${note}\n`);
  }
}
