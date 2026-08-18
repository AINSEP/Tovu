import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * @file `tovu theme validate <dir>` — process-spawn integration tier, mirroring
 * `introspect-command.integration.test.ts`'s convention (`tsx` dev-mode, no prior build required).
 * The validator's own logic is certified in
 * `src/features/theme/validation/__tests__/validate-theme-package.test.ts`; this file only proves
 * the CLI wire — argv parsing, exit code, `--json` vs. human-readable output.
 */

const CLI_MAIN = path.resolve(__dirname, "../../main.ts");

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI_MAIN, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function writeValidV1Theme(dir: string): void {
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: path.basename(dir), name: "T", version: "1.0.0", tier: "declarative", engine: 1 }), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "home.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "entry.json"), "{}", "utf8");
}

test("tovu theme validate <dir>: a valid theme exits 0 and prints a human-readable VALID summary", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-validate-ok-"));
  writeValidV1Theme(dir);

  const result = runCli(["theme", "validate", dir]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /VALID/);
});

test("tovu theme validate <dir> --json: prints the full machine-readable result", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-validate-json-"));
  writeValidV1Theme(dir);

  const result = runCli(["theme", "validate", dir, "--json"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.schemaVersion, 1);
});

test("tovu theme validate <dir>: an invalid theme exits 1 (a finding, not a crash) and reports errors", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-validate-bad-"));
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "wrong-id", name: "T", version: "1.0.0", tier: "declarative", engine: 1 }), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");

  const result = runCli(["theme", "validate", dir]);
  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /INVALID/);
  assert.match(result.stdout, /must equal folder name/);
});

test("tovu theme validate <dir> --profile <bad>: rejected as VALIDATION (exit 2), not a silent fallback", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-validate-badprofile-"));
  writeValidV1Theme(dir);

  const result = runCli(["theme", "validate", dir, "--profile", "nonsense"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /^tovu: VALIDATION:/m);
});
