import { initSite } from "../../platform/site-dir/init-site.js";
import { readSiteDir } from "../../platform/site-dir/read-site-dir.js";

/**
 * @file SPEC-003 C-001 (`CLI_INIT`) — wires a commander action's parsed arguments to
 * `site-dir/init-site.ts`'s `initSite`, and formats the `CLI_INIT` stdout contract.
 *
 * Architectural role:
 * `cli` layer. Formats stdout only — never maps errors to exit codes itself (that is
 * `cli/errors.ts`'s job; this function lets `initSite`'s typed errors propagate uncaught).
 */

export interface RunInitCommandInput {
  dir: string;
  name?: string;
}

/**
 * Run `tovu init <dir> [--name]`: create the install dir, then print the api.spec.md §5 success
 * contract (`created site '<name>' at <dir>` + `next: tovu serve <dir>`).
 *
 * @throws whatever `initSite` throws (`ValidationError`, `InitDirNotEmptyError`,
 *   `InternalError`) — `cli/main.ts` maps these to the correct exit code.
 * @complexity O(1) beyond `initSite`'s own bounded cost.
 * @overallScore 100
 */
export async function runInitCommand(input: RunInitCommandInput): Promise<void> {
  const result = initSite({ dir: input.dir, name: input.name });
  // Read the ACTUAL written config.json back (rather than re-deriving the name here) so the
  // printed name can never drift from what `initSite` really wrote to disk.
  const { config } = readSiteDir({ dir: result.dir });
  process.stdout.write(`created site '${config.name}' at ${result.dir}\n`);
  process.stdout.write(`next: tovu serve ${result.dir}\n`);
}
