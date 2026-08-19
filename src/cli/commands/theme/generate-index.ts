import path from "node:path";

import { generateStaticPortabilityIndex, type GenerateStaticPortabilityIndexResult } from "../../../features/theme/index.js";

/**
 * @file `tovu theme generate-index <dir> [--json]` — `static-portability-index.ts`'s CLI surface.
 * Mirrors `theme validate`/`theme migrate`'s shape: formats stdout only, signals a skip (not a
 * `static`-tier theme, or one that failed to load) via `process.exitCode = 1` rather than throwing —
 * an ordinary, expected outcome for a non-static theme run through this by mistake, not a CLI crash.
 */

export interface RunThemeGenerateIndexCommandInput {
  dir: string;
  json?: boolean;
}

function formatSummary(id: string, result: GenerateStaticPortabilityIndexResult): string {
  if (result.status === "written") {
    return `theme '${id}': generated portability index at ${result.path}\n`;
  }
  return `theme '${id}': skipped — ${result.reason}\n`;
}

/**
 * Run `tovu theme generate-index <dir> [--json]`.
 *
 * @complexity O(1) beyond `generateStaticPortabilityIndex`'s own bounded cost.
 */
export async function runThemeGenerateIndexCommand(input: RunThemeGenerateIndexCommandInput): Promise<void> {
  const dir = path.resolve(input.dir);
  const id = path.basename(dir);
  const result = generateStaticPortabilityIndex({ themeDir: dir, id });

  if (input.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatSummary(id, result));
  }

  if (result.status === "skipped") {
    process.exitCode = 1;
  }
}
