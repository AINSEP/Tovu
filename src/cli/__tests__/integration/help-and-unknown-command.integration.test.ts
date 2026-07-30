import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

/**
 * @file SPEC-003 C-003 (`CLI_HELP`) — TDD certification, integration (process-spawn) tier.
 *
 * Traces: REQ-09, AC-12, api.spec.md §1/§6 (Status Code Map), errors.spec.md.
 *
 * `src/cli/main.ts`/`src/cli/help.ts` do not exist yet, and `commander` is not yet a dependency —
 * every spawn below is expected to fail until Programmer implements `src/cli/*` (tasks.md T020)
 * and adds the `commander` dependency (tasks.md T019). Correct TDD state.
 *
 * **Disclosed spec-internal ambiguity (not silently resolved):** `feature.spec.md` REQ-09's prose
 * reads "`tovu --help` and unknown commands exit 2 with usage" — read literally, this would put
 * `--help` at exit 2. But `api.spec.md` §6's Status Code Map and `errors.spec.md` both structure
 * `CLI_HELP` as "0 = help printed" vs. "2 = unknown command" (two DIFFERENT outcomes under one
 * command ID), and the only AC that actually pins an exit code (AC-12) tests exclusively the
 * unknown-command case, asserting exit 2 — it does not claim `--help` itself exits 2. This suite
 * treats the structured, machine-checked artifacts (api.spec.md/errors.spec.md/AC-12) as
 * authoritative over REQ-09's ambiguous single sentence and certifies `--help`/bare `tovu` at exit
 * 0, unknown commands at exit 2 — flagged here, and in the TDD certification record, as a
 * discovered spec-text inconsistency worth a Spec Agent clarification pass, not a silent
 * assumption.
 */

const CLI_MAIN = path.resolve(__dirname, "../../main.ts");

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI_MAIN, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("tovu --help exits 0 and prints usage", () => {
  const result = runCli(["--help"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /init/i, "usage output should mention the init command");
  assert.match(result.stdout, /serve/i, "usage output should mention the serve command");
});

test("tovu with no arguments at all exits 0 and prints usage", () => {
  const result = runCli([]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /usage/i);
});

test("AC-12: tovu <unknown-command> exits 2 with usage printed", () => {
  const result = runCli(["this-command-does-not-exist"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(result.stdout + result.stderr, /usage/i, "AC-12: usage must print for an unknown command");
});
