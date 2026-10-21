import path from "node:path";

import { migrateThemeToV2, type MigrateThemeResult } from "#src/features/theme/index";

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

/** `formatSummary`'s `"failed"` case, split out to keep the switch below a flat dispatch (each
 * remaining case is a single-line template) — this is the one case with its own internal branching
 * (two error lists plus an optional trailing line). */
function formatFailedSummary(id: string, result: MigrateThemeResult): string {
  const lines = [`theme '${id}': migration FAILED — ${result.reason ?? "see validation/load errors below"}`];
  for (const error of result.validation?.errors ?? []) lines.push(`  [validator:${error.ruleId}] ${error.message}`);
  for (const error of result.loadErrors ?? []) lines.push(`  [loadTheme] ${error}`);
  if (result.outputDir) lines.push(`staged output left for inspection at ${result.outputDir}`);
  return `${lines.join("\n")}\n`;
}

/** Injectable effects of {@link runThemeMigrateCommand}. */
export interface RunThemeMigrateCommandPorts {
  migrate?: typeof migrateThemeToV2;
  output?: (message: string) => void;
  setExitCode?: (code: number) => void;
}

function writeStdout(message: string): void {
  process.stdout.write(message);
}

function setProcessExitCode(code: number): void {
  process.exitCode = code;
}

function formatSummary(id: string, result: MigrateThemeResult): string {
  switch (result.status) {
    case "already-migrated":
      return `theme '${id}': already schema v2, nothing to do\n`;
    case "staged-dry-run":
      return `theme '${id}': dry run OK — staged v2 output at ${result.outputDir}, real theme directory untouched\n`;
    case "migrated":
      return `theme '${id}': migrated to schema v2 in place — v1 backup kept at ${result.backupDir}\n`;
    case "failed":
      return formatFailedSummary(id, result);
  }
}

/**
 * Run `tovu theme migrate <dir> [--dry-run] [--json]`.
 *
 * @complexity O(1) beyond `migrateThemeToV2`'s own bounded cost.
 */
export async function runThemeMigrateCommand(
  input: RunThemeMigrateCommandInput,
  optional: RunThemeMigrateCommandPorts = {}
): Promise<void> {
  // Default ports are wired here, at the command edge; tests inject their own.
  const { migrate = migrateThemeToV2, output = writeStdout, setExitCode = setProcessExitCode } = optional;
  const dir = path.resolve(input.dir);
  const id = path.basename(dir);
  const result = migrate({ themeDir: dir, id }, { dryRun: input.dryRun });

  output(input.json ? `${JSON.stringify(result, null, 2)}\n` : formatSummary(id, result));

  if (result.status === "failed") {
    setExitCode(1);
  }
}
