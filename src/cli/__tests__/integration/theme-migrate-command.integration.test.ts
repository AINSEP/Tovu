import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { childProcessCoverageEnv } from "#src/core/child-process-coverage-env";

/**
 * @file `tovu theme migrate <dir>` — process-spawn integration tier, mirroring
 * `theme-validate-command.integration.test.ts`'s convention. The migration orchestrator's own logic
 * is certified in `src/features/theme/migration/__tests__/migrate-theme.test.ts`; this file only
 * proves the CLI wire — argv parsing, exit code, `--dry-run`, `--json` vs. human-readable output.
 */

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");

/** See `export-command.integration.test.ts`'s identical constant for why this exists and why one
 * shared directory for the whole file is safe. */
const WORKER_COVERAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-migrate-worker-coverage-"));
after(() => fs.rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI_MAIN, ...args], {
    encoding: "utf8",
    env: childProcessCoverageEnv(WORKER_COVERAGE_DIR),
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function writeValidV1DeclarativeTheme(dir: string): void {
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: path.basename(dir), name: "T", version: "1.0.0", tier: "declarative", description: "d" }),
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "styles.css"), "body{}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "home.json"), '{"type":"doc","content":[]}', "utf8");
  fs.writeFileSync(path.join(dir, "templates", "entry.json"), '{"type":"doc","content":[]}', "utf8");
}

test("tovu theme migrate <dir>: migrates a valid v1 declarative theme in place and exits 0", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-migrate-ok-"));
  writeValidV1DeclarativeTheme(dir);

  const result = runCli(["theme", "migrate", dir]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /migrated to schema v2/);
  assert.ok(fs.existsSync(path.join(dir, "css/theme.css")));
});

test("tovu theme migrate <dir> --dry-run --json: prints the machine-readable staged result, real dir untouched", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-migrate-dryrun-"));
  writeValidV1DeclarativeTheme(dir);

  const result = runCli(["theme", "migrate", dir, "--dry-run", "--json"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, "staged-dry-run");
  assert.ok(!fs.existsSync(path.join(dir, "css")), "dry run must never touch the real theme directory");
});

test("tovu theme migrate <dir>: an already-migrated theme is a no-op and exits 0", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-migrate-already-"));
  writeValidV1DeclarativeTheme(dir);
  runCli(["theme", "migrate", dir]);

  const second = runCli(["theme", "migrate", dir]);
  assert.equal(second.status, 0, `stderr: ${second.stderr}`);
  assert.match(second.stdout, /already schema v2/);
});

test("tovu theme migrate <dir>: refusing an unrecognized file exits 1 (a finding, not a crash)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-migrate-refuse-"));
  writeValidV1DeclarativeTheme(dir);
  fs.writeFileSync(path.join(dir, "README.md"), "hi", "utf8");

  const result = runCli(["theme", "migrate", dir]);
  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /FAILED/);
  assert.match(result.stdout, /README\.md/);
});
