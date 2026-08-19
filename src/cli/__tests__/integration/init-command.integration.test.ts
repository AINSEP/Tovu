import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * @file SPEC-003 C-001 (`CLI_INIT`) — TDD certification, integration (process-spawn) tier.
 *
 * Traces: REQ-03, REQ-09, BR-01, BR-03, AC-01, AC-04, EC-01, EC-02, EC-06, api.spec.md §5/§6,
 * errors.spec.md (`VALIDATION`, `INIT_DIR_NOT_EMPTY`).
 *
 * `src/cli/main.ts` does not exist yet, and `commander` is not yet a dependency — every spawn in
 * this file is expected to fail (module-not-found / nonzero exit) until Programmer implements
 * `src/cli/*` (tasks.md T020) and adds `"commander": "^15.0.0"` to package.json (tasks.md T019).
 * Correct TDD state.
 *
 * Invocation mirrors this repo's own `npm run dev:server` convention (`tsx watch src/index.ts`) —
 * spawns the CLI entrypoint directly through `tsx`'s dev-mode transform rather than requiring a
 * prior `npm run build`, so this suite stays fast and does not depend on build output.
 */

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI_MAIN, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-init-"));
}

test("AC-01/api.spec.md §5: tovu init <dir> --name <name> exits 0, prints the created-site stdout contract, and produces a real install dir", () => {
  const parent = mkTempParent();
  const target = path.join(parent, "demo");
  try {
    const result = runCli(["init", target, "--name", "Demo"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /Demo/, "stdout must include the site name (api.spec.md §5: 'created site '<name>' at <dir>')");
    assert.match(result.stdout, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "stdout must include the dir (api.spec.md §5)");
    assert.match(result.stdout, /tovu serve/, "api.spec.md §5: stdout must include 'next: tovu serve <dir>'");
    assert.ok(fs.existsSync(path.join(target, ".site-meta.json")), "a real install dir must exist on disk after a successful init");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("BR-03: omitting --name defaults the site name to the directory basename, end to end through the CLI", () => {
  const parent = mkTempParent();
  const target = path.join(parent, "basename-demo");
  try {
    const result = runCli(["init", target]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const config = JSON.parse(fs.readFileSync(path.join(target, "config.json"), "utf8"));
    assert.equal(config.name, "basename-demo");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("AC-04/EC-01: tovu init against an existing non-empty directory exits 3 with INIT_DIR_NOT_EMPTY, directory left untouched", () => {
  const parent = mkTempParent();
  const target = path.join(parent, "occupied");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "keep-me.txt"), "hello");
  try {
    const result = runCli(["init", target, "--name", "Should Fail"]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /^tovu: INIT_DIR_NOT_EMPTY:/m, "errors.spec.md §1: exactly one machine-parseable stderr line");
    assert.deepEqual(fs.readdirSync(target), ["keep-me.txt"]);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("EC-02: tovu init against a path that exists as a regular file exits 3 with INIT_DIR_NOT_EMPTY", () => {
  const parent = mkTempParent();
  const target = path.join(parent, "a-file");
  fs.writeFileSync(target, "i am a file");
  try {
    const result = runCli(["init", target, "--name", "Should Fail"]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /^tovu: INIT_DIR_NOT_EMPTY:/m);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("EC-06: an empty --name exits 2 with VALIDATION, nothing created", () => {
  const parent = mkTempParent();
  const target = path.join(parent, "should-not-exist");
  try {
    const result = runCli(["init", target, "--name", "   "]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^tovu: VALIDATION:/m);
    assert.equal(fs.existsSync(target), false);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("VALIDATION: tovu init with no dir argument at all exits 2 with usage (a missing required positional argument is a usage error)", () => {
  const result = runCli(["init"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^tovu: VALIDATION:/m);
});
