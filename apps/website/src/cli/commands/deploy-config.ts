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
import { isSiteIdToken, readSiteMetaId } from "../../features/webhooks/index.js";
import { resolveProductRoot, resolveSiteRoot, ValidationError } from "../../platform/site-dir/index.js";

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
  /** Which local site's id to stamp (a registered site name); default: the site this process serves. */
  site?: string;
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

/** The env `resolveSiteRoot` reads, with `--site <name>` taking the place of TOVU_SITE_DIR / TOVU_SITE. */
function siteSelectionEnv(env: NodeJS.ProcessEnv, site: string | undefined): NodeJS.ProcessEnv {
  if (site === undefined) return env;
  const { TOVU_SITE_DIR: _ignored, ...rest } = env;
  return { ...rest, TOVU_SITE: site };
}

/**
 * The deployed server's site identity: `TOVU_SITE_ID` = the local site's own `.site-meta.json` id
 * (`--site <name>`, else the site this process serves: `TOVU_SITE_DIR`, else `TOVU_SITE`, else the
 * default). Production never mints a meta of its own, so without this every deployed site reports as
 * the shared starter workspace id (`deps.ts`'s `siteIdentityFor` reads it). A non-secret id, so it
 * goes in the generated env block, and only as a short token (`isSiteIdToken`): a hand-edited id
 * holding a newline or quotes would otherwise write lines of its own into the file. Which site was
 * stamped is told on stderr. Nothing is added for a site with no id yet, an id that is not a token,
 * or when the site cannot be resolved (told on stderr): the config still renders.
 * @complexity O(n) registered sites (`resolveSiteRoot`) plus one small file read.
 */
function siteIdentityEnv(env: NodeJS.ProcessEnv, stderr: (message: string) => void, site?: string): Record<string, string> {
  let siteRoot: string;
  try {
    siteRoot = resolveSiteRoot({ env: siteSelectionEnv(env, site) });
  } catch (error) {
    stderr(`tovu deploy config: the site could not be resolved, so TOVU_SITE_ID is not set: ${error instanceof Error ? error.message : String(error)}\n`);
    return {};
  }
  const siteId = readSiteMetaId(siteRoot);
  if (siteId === undefined) return {};
  if (!isSiteIdToken(siteId)) {
    stderr(`tovu deploy config: ${path.join(siteRoot, ".site-meta.json")} holds ${JSON.stringify(siteId.slice(0, 80))}, which is not a valid site id, so TOVU_SITE_ID is not set\n`);
    return {};
  }
  stderr(`tovu deploy config: stamped TOVU_SITE_ID=${siteId} (site '${path.basename(siteRoot)}' at ${siteRoot})\n`);
  return { TOVU_SITE_ID: siteId };
}

/**
 * Run `tovu deploy config --target <t> --region <r> [--site <name>] [--out <file>]`.
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
  const options: RenderDeployConfigOptions = { region: input.region ?? "", env: siteIdentityEnv(env, stderr, input.site) };
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
