import path from "node:path";

import { ValidationError } from "#src/platform/site-dir/index";
import {
  validateThemePackage,
  type ThemeValidationFinding,
  type ThemeValidationProfile,
  type ValidateThemePackageResult,
} from "#src/features/theme/index";

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

/** Injectable effects of {@link runThemeValidateCommand}. */
export interface RunThemeValidateCommandPorts {
  validate?: typeof validateThemePackage;
  output?: (required: { message: string }, optional?: Record<string, never>) => void;
  setExitCode?: (required: { code: number }, optional?: Record<string, never>) => void;
}

function writeStdout({ message }: { message: string }, _optional = {}): void {
  process.stdout.write(message);
}

function setProcessExitCode({ code }: { code: number }, _optional = {}): void {
  process.exitCode = code;
}

function formatFinding(finding: ThemeValidationFinding): string {
  const location = finding.path ? ` (${finding.path})` : "";
  return `  [${finding.ruleId}]${location} ${finding.message}`;
}

/** The `--json`-off branch of `runThemeValidateCommand` — split out so that function's own
 * cognitive complexity isn't compounded by nesting this printing logic inside its `if/else`. */
function printHumanReadableResult({ id, profile, result, output }: { id: string; profile: string; result: ValidateThemePackageResult; output: (required: { message: string }, optional?: Record<string, never>) => void }, _options = {}): void {
  output({ message: `theme '${id}' (schema v${result.schemaVersion}, profile: ${profile}): ${result.valid ? "VALID" : "INVALID"}\n` });
  if (result.errors.length > 0) {
    output({ message: `errors (${result.errors.length}):\n${result.errors.map(formatFinding).join("\n")}\n` });
  }
  if (result.warnings.length > 0) {
    output({ message: `warnings (${result.warnings.length}):\n${result.warnings.map(formatFinding).join("\n")}\n` });
  }
}

/**
 * Run `tovu theme validate <dir> [--profile <p>] [--json]`.
 *
 * @throws {ValidationError} `--profile` is anything other than `author`/`publish`/`install`.
 * @complexity O(1) beyond `validateThemePackage`'s own bounded cost.
 * @overallScore 100
 */
export async function runThemeValidateCommand(
  input: RunThemeValidateCommandInput,
  optional: RunThemeValidateCommandPorts = {}
): Promise<void> {
  // Default ports are wired here, at the command edge; tests inject their own.
  const { validate = validateThemePackage, output = writeStdout, setExitCode = setProcessExitCode } = optional;
  const profile = input.profile ?? "author";
  if (!VALID_PROFILES.has(profile)) {
    throw new ValidationError({ message: `--profile must be one of: author, publish, install (got "${profile}")` });
  }

  const dir = path.resolve(input.dir);
  const id = path.basename(dir);
  const result = validate({ themeDir: dir, id, profile: profile as ThemeValidationProfile });

  if (input.json) {
    output({ message: `${JSON.stringify(result, null, 2)}\n` });
  } else {
    printHumanReadableResult({ id: id, profile: profile, result: result, output: output });
  }

  if (!result.valid) {
    setExitCode({ code: 1 });
  }
}
