import path from "node:path";
import { writeFileSync } from "node:fs";

import {
  buildDeploymentDescriptor,
  renderFlyToml,
  renderRailwayConfig,
  renderRenderYaml,
  type DeploymentDescriptor,
  type DeploymentTarget,
  type RenderDeployConfigOptions,
  type RenderedDeployConfig,
} from "../../features/deployments/index.js";
import { ValidationError } from "../../platform/site-dir/index.js";

/**
 * @file `tovu deploy config --target <fly|render|railway> --region <region> [--out <file>]` —
 * wires parsed argv to `features/deployments`'s single `DeploymentDescriptor` and its three
 * platform renderers (`features/deployments/deploy-config.ts`'s own header explains why there is
 * exactly one descriptor and three thin renderers, never four independent generators).
 *
 * Purpose:
 * `--target` is this command's own value-level validation (same pattern `theme validate`'s
 * `--profile` already establishes — an enum commander itself cannot type-check from argv alone).
 * `--region` is NOT validated here: each renderer validates it itself (presence, and — where a real
 * platform enum exists — membership), so the exact same check applies whether this CLI calls a
 * renderer or a future admin route does. Prints the rendered config to stdout by default (composable
 * with shell redirection, e.g. `tovu deploy config --target fly --region iad > fly.toml`), or writes
 * it straight to `--out` when given. Every renderer's own follow-up `notes` (volume creation, where
 * to set a secret's real value) print to stderr — never mixed into the file contents on stdout.
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

const VALID_TARGETS: ReadonlySet<string> = new Set<DeploymentTarget>(["fly", "render", "railway"]);

function isDeploymentTarget(value: string): value is DeploymentTarget {
  return VALID_TARGETS.has(value);
}

/** Dispatches to the one renderer `target` names. A `switch` over the narrowed
 *  {@link DeploymentTarget} union (not a lookup object) so adding a fourth target without adding its
 *  `case` here is a compile error, not a silent `undefined` — the same exhaustiveness guarantee
 *  `deploy-config.ts`'s own header promises ("a fifth platform is one new renderer file"). The
 *  trailing `default` is dead code today (TS already proves the three cases above are exhaustive
 *  over {@link DeploymentTarget}) — it exists only so every path explicitly returns or throws,
 *  rather than leaving an ESLint-visible implicit-`undefined` fall-through. */
function renderForTarget(
  target: DeploymentTarget,
  descriptor: DeploymentDescriptor,
  options: RenderDeployConfigOptions
): RenderedDeployConfig {
  switch (target) {
    case "fly":
      return renderFlyToml(descriptor, options);
    case "render":
      return renderRenderYaml(descriptor, options);
    case "railway":
      return renderRailwayConfig(descriptor, options);
    default: {
      const unreachable: never = target;
      throw new Error(`tovu deploy config: unhandled target "${String(unreachable)}"`);
    }
  }
}

/**
 * Run `tovu deploy config --target <t> --region <r> [--out <file>]`.
 *
 * @throws {ValidationError} an unknown `--target`, a missing/invalid `--region` (raised by the
 *   chosen renderer itself).
 * @throws {Error} `buildDeploymentDescriptor`'s own derivation-failure error, if a source file
 *   (`Dockerfile`, `fly.toml`, the readyz route) has drifted out of sync with this command's own
 *   extraction patterns.
 * @complexity O(1) beyond `buildDeploymentDescriptor`'s and the chosen renderer's own bounded costs.
 */
export async function runDeployConfigCommand(input: RunDeployConfigCommandInput): Promise<void> {
  const targetRaw = input.target ?? "";
  if (!isDeploymentTarget(targetRaw)) {
    throw new ValidationError(`--target must be one of: fly, render, railway (got "${targetRaw}")`);
  }

  const descriptor = buildDeploymentDescriptor();
  const options: RenderDeployConfigOptions = { region: input.region ?? "" };
  const rendered = renderForTarget(targetRaw, descriptor, options);

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
