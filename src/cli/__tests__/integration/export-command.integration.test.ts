import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * @file `tovu export <dir>` — TDD certification, integration (process-spawn) tier, mirroring
 * `serve-command.integration.test.ts`'s and `init-command.integration.test.ts`'s own convention:
 * spawn the real `tovu` CLI (via `tsx`'s dev-mode transform, no prior `npm run build` required)
 * against a real install directory `tovu init` itself just created, rather than calling
 * `runExportCommand`/`exportSite` in-process — this proves the CLI wiring end to end (argv parsing,
 * `--out`/`--workspace`/`--clean`/`--base-path` flags, the `errors.spec.md`-style exit-code
 * contract), which `export/__tests__/site-exporter.test.ts`'s direct-function tests cannot.
 */

const CLI_MAIN = path.resolve(__dirname, "../../main.ts");
const TSX_LOADER = require.resolve("tsx");

function runCli(args: string[], timeoutMs = 30000): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, ...args], { encoding: "utf8", timeout: timeoutMs });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-export-"));
}

test("tovu export <dir> --out <out>: exits 0, prints an honest route/asset summary, and writes a real static file tree", (t) => {
  const parent = mkTempParent();
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const installDir = path.join(parent, "site");
  const outDir = path.join(parent, "out");

  const init = runCli(["init", installDir]);
  assert.equal(init.status, 0, `init stderr: ${init.stderr}`);

  const result = runCli(["export", installDir, "--out", outDir]);
  assert.equal(result.status, 0, `export stderr: ${result.stderr}`);
  assert.match(result.stdout, /tovu export: wrote \d+\/\d+ routes and \d+\/\d+ assets to /);

  assert.ok(fs.existsSync(path.join(outDir, "index.html")), "home page written");
  assert.ok(fs.existsSync(path.join(outDir, "404.html")), "404 page written at the output root");
  const home = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  assert.match(home, /<!doctype html>/i);
});

test("tovu export: a non-empty --out is refused (EXPORT_OUTPUT_NOT_EMPTY, exit 3) unless --clean is passed", (t) => {
  const parent = mkTempParent();
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const installDir = path.join(parent, "site");
  const outDir = path.join(parent, "out");

  assert.equal(runCli(["init", installDir]).status, 0);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "stale.html"), "leftover", "utf8");

  const refused = runCli(["export", installDir, "--out", outDir]);
  assert.equal(refused.status, 3, `stderr: ${refused.stderr}`);
  assert.match(refused.stderr, /^tovu: EXPORT_OUTPUT_NOT_EMPTY:/m);
  assert.ok(fs.existsSync(path.join(outDir, "stale.html")), "refusing must not touch existing contents");

  const cleaned = runCli(["export", installDir, "--out", outDir, "--clean"]);
  assert.equal(cleaned.status, 0, `stderr: ${cleaned.stderr}`);
  assert.equal(fs.existsSync(path.join(outDir, "stale.html")), false);
  assert.ok(fs.existsSync(path.join(outDir, "index.html")));
});

test("tovu export --base-path <path>: rewrites root-relative links and prints the disclosed-limit warning", (t) => {
  const parent = mkTempParent();
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const installDir = path.join(parent, "site");
  const outDir = path.join(parent, "out");

  assert.equal(runCli(["init", installDir]).status, 0);

  const result = runCli(["export", installDir, "--out", outDir, "--base-path", "/my-repo"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /rewrote root-relative links\/assets for base path '\/my-repo'/);
  assert.match(result.stderr, /warning:.*best-effort TEXT rewrite/, "the disclosed rewrite-limit warning must print when a base path is set");

  const home = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  assert.match(home, /href="\/my-repo\//, "at least one internal link must carry the base path");
});

test("tovu export: TOVU_EXPORT_DIR env var sets the default output directory when --out is omitted", (t) => {
  const parent = mkTempParent();
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const installDir = path.join(parent, "site");
  const envOutDir = path.join(parent, "env-out");

  assert.equal(runCli(["init", installDir]).status, 0);

  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, "export", installDir], {
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, TOVU_EXPORT_DIR: envOutDir },
  });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(fs.existsSync(path.join(envOutDir, "index.html")), "export must land under TOVU_EXPORT_DIR");
});
