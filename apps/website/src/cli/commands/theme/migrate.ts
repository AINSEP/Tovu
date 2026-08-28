import path from "node:path";

import { migrateThemeToV2, type MigrateThemeResult } from "../../../features/theme/index.js";

/**
 * @file `tovu theme migrate <dir> [--dry-run] [--json]` — `migrate-theme.ts`'s CLI surface. Mirrors
 * `theme validate`'s shape (`cli/commands/theme/validate.ts`): formats stdout only, signals a
 * migration that did not succeed via `process.exitCode = 1` rather than throwing (a theme that isn't
 * ready to migrate is an expected, ran-to-completion outcome, not a CLI crash).
 */

export interface RunThemeMigrateCommandInput {
  dir: string;
  dryRun?: boolean;
  json?: boolean;
}

function formatSummary(id: string, result: MigrateThemeResult): string {
  switch (result.status) {
    case "already-migrated":
      return `theme '${id}': already schema v2, nothing to do\n`;
    case "staged-dry-run":
      return `theme '${id}': dry run OK — staged v2 output at ${result.outputDir}, real theme directory untouched\n`;
    case "migrated":
      return `theme '${id}': migrated to schema v2 in place — v1 backup kept at ${result.backupDir}\n`;
    case "failed": {
      const lines = [`theme '${id}': migration FAILED — ${result.reason ?? "see validation/load errors below"}`];
      for (const error of result.validation?.errors ?? []) lines.push(`  [validator:${error.ruleId}] ${error.message}`);
      for (const error of result.loadErrors ?? []) lines.push(`  [loadTheme] ${error}`);
      if (result.outputDir) lines.push(`staged output left for inspection at ${result.outputDir}`);
      return `${lines.join("\n")}\n`;
    }
  }
}

/**
 * Run `tovu theme migrate <dir> [--dry-run] [--json]`.
 *
 * @complexity O(1) beyond `migrateThemeToV2`'s own bounded cost.
 */
export async function runThemeMigrateCommand(input: RunThemeMigrateCommandInput): Promise<void> {
  const dir = path.resolve(input.dir);
  const id = path.basename(dir);
  const result = migrateThemeToV2({ themeDir: dir, id }, { dryRun: input.dryRun });

  if (input.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatSummary(id, result));
  }

  if (result.status === "failed") {
    process.exitCode = 1;
  }
}
