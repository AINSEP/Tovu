import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";

/**
 * @file `tovu deploy config --target <t> --region <r> [--out <file>]` — process-spawn integration
 * tier, mirroring `theme-validate-command.integration.test.ts`'s convention. The renderers' own
 * logic (exact output shape, region validation, secret handling) is certified in
 * `features/deployments/__tests__/deploy-config-*.unit.test.ts`; this file only proves the CLI
 * wire — argv parsing, `--target` enum rejection, stdout-vs-`--out`, exit codes.
 *
 * Run with cwd at the repo root (inherited from the test runner, same assumption
 * `dockerfile.unit.test.ts` already makes) — `buildDeploymentDescriptor` reads the real
 * `Dockerfile`/`fly.toml` from `process.cwd()`.
 */

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");

const WORKER_COVERAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-deploy-config-worker-coverage-"));
after(() => fs.rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI_MAIN, ...args], {
    encoding: "utf8",
    env: childProcessCoverageEnv(WORKER_COVERAGE_DIR),
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("tovu deploy config --target fly --region <r>: exits 0 and prints fly.toml to stdout", () => {
  const result = runCli(["deploy", "config", "--target", "fly", "--region", "iad"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /^app = "tovu-ai-cms"$/m);
  assert.match(result.stdout, /primary_region = "iad"/);
  assert.match(result.stdout, /path = "\/readyz"/);
  // Follow-up notes go to stderr, never mixed into the file contents on stdout.
  assert.match(result.stderr, /fly volumes create/);
  assert.doesNotMatch(result.stdout, /fly volumes create/);
});

test("tovu deploy config --target render --region <r>: exits 0 and prints render.yaml to stdout", () => {
  const result = runCli(["deploy", "config", "--target", "render", "--region", "oregon"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /name: tovu-ai-cms/);
  assert.match(result.stdout, /region: oregon/);
  assert.match(result.stdout, /healthCheckPath: \/readyz/);
});

test("tovu deploy config --target railway --region <r>: exits 0 and prints valid JSON to stdout", () => {
  const result = runCli(["deploy", "config", "--target", "railway", "--region", "us-west2"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.deploy.healthcheckPath, "/readyz");
  assert.deepEqual(Object.keys(parsed.deploy.multiRegionConfig), ["us-west2"]);
});

test("tovu deploy config --target <bad>: rejected as VALIDATION (exit 2), not a silent fallback", () => {
  const result = runCli(["deploy", "config", "--target", "heroku", "--region", "us-east-1"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /^tovu: VALIDATION:/m);
  assert.match(result.stderr, /fly, render, railway/);
});

test("tovu deploy config --target render (no --region): rejected as VALIDATION (exit 2), no silent default region", () => {
  const result = runCli(["deploy", "config", "--target", "render"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /^tovu: VALIDATION:/m);
  assert.match(result.stderr, /--region is required/);
});

test("tovu deploy config --target railway --region <bad>: rejected as VALIDATION (exit 2)", () => {
  const result = runCli(["deploy", "config", "--target", "railway", "--region", "not-a-real-region"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /is not a valid Railway region/);
});

test("tovu deploy config --target fly --region <r> --out <file>: writes the file instead of printing it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-deploy-config-out-"));
  const outFile = path.join(dir, "generated-fly.toml");

  const result = runCli(["deploy", "config", "--target", "fly", "--region", "iad", "--out", outFile]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /wrote fly\.toml \(fly\) to/);
  assert.doesNotMatch(result.stdout, /^app = /m, "the file's own contents must not ALSO print to stdout");

  const written = fs.readFileSync(outFile, "utf8");
  assert.match(written, /^app = "tovu-ai-cms"$/m);

  fs.rmSync(dir, { recursive: true, force: true });
});
