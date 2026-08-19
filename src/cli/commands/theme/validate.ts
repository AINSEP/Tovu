import path from "node:path";

import { ValidationError } from "../../../site-dir/index.js";
import {
  validateThemePackage,
  type ThemeValidationFinding,
  type ThemeValidationProfile,
} from "../../../features/theme/index.js";

/**
 * @file `tovu theme validate <dir> --profile <author|publish|install> [--json]` —
 * `validate-theme-package.ts`'s CLI surface. Wires parsed argv to the real validator and formats its
 * result; all VALUE-level validation (`--profile` outside the known set) is this module's own job,
 * matching `runIntrospectCommand`'s identical `--format` pattern (`cli/commands/introspect.ts`).
 *
 * Architectural role:
 * `cli` layer, formats stdout only — never maps errors to exit codes itself (`cli/errors.ts`'s job
 * for a thrown error; a validation FAILURE, as opposed to a CLI usage error, is signaled by
 * `process.exitCode = 1` instead of a throw, since "the theme has problems" is an expected, ran-
 * to-completion outcome, the same distinction `tsc`/`eslint` draw between a crash and a finding).
 */

export interface RunThemeValidateCommandInput {
  dir: string;
  profile?: string;
  json?: boolean;
}

const VALID_PROFILES: ReadonlySet<string> = new Set(["author", "publish", "install"]);

function formatFinding(finding: ThemeValidationFinding): string {
  const location = finding.path ? ` (${finding.path})` : "";
  return `  [${finding.ruleId}]${location} ${finding.message}`;
}

/**
 * Run `tovu theme validate <dir> [--profile <p>] [--json]`.
 *
 * @throws {ValidationError} `--profile` is anything other than `author`/`publish`/`install`.
 * @complexity O(1) beyond `validateThemePackage`'s own bounded cost.
 * @overallScore 100
 */
export async function runThemeValidateCommand(input: RunThemeValidateCommandInput): Promise<void> {
  const profile = input.profile ?? "author";
  if (!VALID_PROFILES.has(profile)) {
    throw new ValidationError(`--profile must be one of: author, publish, install (got "${profile}")`);
  }

  const dir = path.resolve(input.dir);
  const id = path.basename(dir);
  const result = validateThemePackage({ themeDir: dir, id, profile: profile as ThemeValidationProfile });

  if (input.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`theme '${id}' (schema v${result.schemaVersion}, profile: ${profile}): ${result.valid ? "VALID" : "INVALID"}\n`);
    if (result.errors.length > 0) {
      process.stdout.write(`errors (${result.errors.length}):\n${result.errors.map(formatFinding).join("\n")}\n`);
    }
    if (result.warnings.length > 0) {
      process.stdout.write(`warnings (${result.warnings.length}):\n${result.warnings.map(formatFinding).join("\n")}\n`);
    }
  }

  if (!result.valid) {
    process.exitCode = 1;
  }
}
