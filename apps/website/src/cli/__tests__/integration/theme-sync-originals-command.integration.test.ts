import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";

/**
 * @file `tovu theme sync-originals <themesRoot>` — process-spawn integration tier, mirroring
 * `theme-normalize-build-command.integration.test.ts`'s convention. `sync-originals.ts`'s own
 * generation logic is certified in `src/features/theme/__tests__/sync-originals.test.ts`; this file
 * proves the CLI WIRE — argv parsing, `--json` vs. human-readable output, and that the process exits
 * 0 and actually writes the catalog on disk, not just in-process.
 */

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");

/** See `export-command.integration.test.ts`'s identical constant for why this exists and why one
 * shared directory for the whole file is safe. */
const WORKER_COVERAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-sync-originals-worker-coverage-"));
after(() => fs.rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI_MAIN, ...args], {
    encoding: "utf8",
    env: childProcessCoverageEnv(WORKER_COVERAGE_DIR),
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** A throwaway themes root with one minimal, valid `static`-tier theme. */
function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-sync-originals-"));
  const themeDir = path.join(root, "static", "fixture-theme");
  fs.mkdirSync(path.join(themeDir, "css"), { recursive: true });
  fs.writeFileSync(path.join(themeDir, "theme.json"), JSON.stringify({ id: "fixture-theme", tier: "static", version: "0.1.0" }));
  fs.writeFileSync(path.join(themeDir, "css", "theme.css"), "body{color:live}");
  return root;
}

test("tovu theme sync-originals <themesRoot>: writes a matching original for every shipped theme, exits 0", () => {
  const root = makeThemesRoot();

  const result = runCli(["theme", "sync-originals", root]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /static\/fixture-theme/);

  const originalCss = path.join(root, "__original-themes__", "static", "fixture-theme", "css", "theme.css");
  assert.equal(fs.readFileSync(originalCss, "utf8"), "body{color:live}");
});

test("tovu theme sync-originals <themesRoot> --json: prints the machine-readable per-theme result", () => {
  const root = makeThemesRoot();

  const result = runCli(["theme", "sync-originals", root, "--json"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.themes, [{ tier: "static", id: "fixture-theme" }]);
});

test("tovu theme sync-originals <themesRoot>: an empty themes root reports zero themes instead of throwing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-sync-originals-empty-"));

  const result = runCli(["theme", "sync-originals", root]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /no shipped themes found/);
});
