import path from "node:path";

import { ValidationError } from "../../../site-dir/index.js";
import { normalizeBuildOutputDirectory, type NormalizeBuildOutputResult } from "../../../features/theme/index.js";

/**
 * @file `tovu theme normalize-build <dir> --primary-stylesheet <file> [--pages <a.html,b.html>] [--json]`
 * — `code-tier-asset-normalizer.ts`'s CLI surface, the entrypoint that module's own file header
 * named as still missing ("Wiring it would mean: (1) deciding WHO invokes it — most likely a
 * standalone CLI/script an Angular theme author runs locally or in their own CI after `ng build`").
 * Mirrors `theme validate`/`theme migrate`/`theme generate-index`'s shape: formats stdout only,
 * lets a precondition violation (e.g. Beasties left enabled, an already-nested output tree)
 * propagate as a thrown error rather than a status object — unlike those three, normalizing a
 * malformed build output isn't an expected, ran-to-completion outcome; it means the `ng build`
 * config upstream is wrong (see the module's own header), so it belongs in `cli/errors.ts`'s
 * generic INTERNAL bucket like any other precondition failure, not a `process.exitCode = 1` finding.
 *
 * `--pages` defaults to `"index.html"` — the module's own doc comment on `pageFileNames` names this
 * as the common case ("an Angular SPA build emits exactly one, `index.html`"); a prerendered
 * multi-route build overrides with its own comma-separated route file list.
 */

export interface RunThemeNormalizeBuildCommandInput {
  dir: string;
  primaryStylesheet?: string;
  pages?: string;
  json?: boolean;
}

function formatSummary(result: NormalizeBuildOutputResult): string {
  const lines = [`normalized ${result.plan.relocations.length} asset file(s), rewrote ${result.rewrittenPageFiles.length} page file(s)`];
  for (const relocation of result.plan.relocations) lines.push(`  moved ${relocation.from} -> ${relocation.to}`);
  for (const page of result.rewrittenPageFiles) lines.push(`  rewrote ${page}`);
  if (result.discardedFiles.length > 0) {
    lines.push(`discarded ${result.discardedFiles.length} framework artifact(s): ${result.discardedFiles.join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Run `tovu theme normalize-build <dir> --primary-stylesheet <file> [--pages <a.html,b.html>] [--json]`.
 *
 * @throws {ValidationError} `--primary-stylesheet` is missing, or `--pages` resolves to an empty list.
 * @complexity O(1) beyond `normalizeBuildOutputDirectory`'s own bounded cost.
 */
export async function runThemeNormalizeBuildCommand(input: RunThemeNormalizeBuildCommandInput): Promise<void> {
  if (!input.primaryStylesheet) {
    throw new ValidationError("--primary-stylesheet is required (the build's global CSS entry point, e.g. \"styles.css\")");
  }

  const pageFileNames = (input.pages ?? "index.html")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (pageFileNames.length === 0) {
    throw new ValidationError('--pages must name at least one HTML file (got an empty list)');
  }

  const outputDir = path.resolve(input.dir);
  const result = normalizeBuildOutputDirectory({ outputDir, pageFileNames, primaryStylesheetFile: input.primaryStylesheet });

  if (input.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatSummary(result));
  }
}
