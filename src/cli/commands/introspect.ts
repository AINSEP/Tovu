import { ValidationError } from "../../site-dir/errors";
import type { CliManifest } from "../introspect";
import { toMcpTools } from "../introspect";

/**
 * @file SPEC-003 (added 2026-07-29, `CLI_INTROSPECT`) — formats `introspectProgram()`'s output
 * for `tovu introspect [--format commander|mcp]`.
 *
 * Architectural role:
 * `cli` layer. Formats stdout only, mirroring `commands/init.ts`/`commands/serve.ts` — never maps
 * errors to exit codes itself (`cli/errors.ts`'s job).
 */

export interface RunIntrospectCommandInput {
  /** Already-introspected manifest — `program.ts`'s action builds this from the live `Command` tree so this module never needs to import `program.ts` itself (would be circular). */
  manifest: CliManifest;
  format?: string;
}

const VALID_FORMATS = new Set(["commander", "mcp"]);

/**
 * Run `tovu introspect [--format <commander|mcp>]`: print a JSON description of this CLI's real
 * command/argument/option surface — `commander` is the raw shape, `mcp` reshapes it into MCP tool
 * definitions for an agent (e.g. Tovu-Runner) driving `tovu` as a subprocess.
 *
 * @throws {ValidationError} `--format` is anything other than `"commander"` or `"mcp"`.
 * @complexity O(1) beyond `JSON.stringify`'s own cost over an already-built manifest.
 * @overallScore 100
 */
export async function runIntrospectCommand(input: RunIntrospectCommandInput): Promise<void> {
  const format = input.format ?? "commander";
  if (!VALID_FORMATS.has(format)) {
    throw new ValidationError(`--format must be one of: commander, mcp (got "${format}")`);
  }

  const output = format === "mcp" ? toMcpTools(input.manifest) : input.manifest;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
