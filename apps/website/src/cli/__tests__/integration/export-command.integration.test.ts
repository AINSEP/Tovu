import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";

const require = createRequire(import.meta.url);

/**
 * @file `tovu export <dir>` — TDD certification, integration (process-spawn) tier, mirroring
 * `serve-command.integration.test.ts`'s and `init-command.integration.test.ts`'s own convention:
 * spawn the real `tovu` CLI (via `tsx`'s dev-mode transform, no prior `npm run build` required)
 * against a real install directory `tovu init` itself just created, rather than calling
 * `runExportCommand`/`exportSite` in-process — this proves the CLI wiring end to end (argv parsing,
 * `--out`/`--workspace`/`--clean`/`--base-path` flags, the `errors.spec.md`-style exit-code
 * contract), which `export/__tests__/site-exporter.test.ts`'s direct-function tests cannot.
 */

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");
const TSX_LOADER = require.resolve("tsx");

/**
 * `timeoutMs` is a safety net, not an expectation (same convention as `serve-command.integration
 * .test.ts`'s own `runCliSync` doc) — it exists so a regression that hangs the CLI cannot wedge this
 * synchronous spawn, and with it the whole file, indefinitely. 30000ms measured too tight for a real
 * `export` call: a cold `tsx`-transformed `tovu export` alone took 23.2s wall-clock under this
 * session's concurrent-agent CPU contention (load average 30+ on an 8-core host), and a test that
 * chains two or three CLI invocations (`init` + one or two `export`s) can exceed 30s in total even
 * though each individual command completes and exits correctly — `spawnSync` returns `status: null`
 * on a timeout kill, which reads exactly like a crash but is the harness's own budget being too
 * tight, not a CLI defect.
 */
/**
 * Coverage output for the child processes this file spawns, redirected out of the test runner's
 * own aggregation directory — see `childProcessCoverageEnv`'s doc for why a plain `delete` does
 * not work. Shared across every `runCli` call in this file rather than one per call: Node names
 * each child's coverage file by pid+timestamp, so concurrent writers into the same directory
 * never collide.
 */
const WORKER_COVERAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-export-worker-coverage-"));
after(() => fs.rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

function runCli(args: string[], timeoutMs = 120000): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    env: childProcessCoverageEnv(WORKER_COVERAGE_DIR),
  });
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
  assert.match(home, /href="\/welcome"/, "the seeded welcome post must appear in the exported home page");
  assert.match(fs.readFileSync(path.join(outDir, "welcome", "index.html"), "utf8"), /Welcome/);
  const counts = result.stdout.match(/wrote (\d+)\/(\d+) routes and (\d+)\/(\d+) assets/);
  assert.ok(counts);
  const [, routesWritten, routesTotal, assetsWritten, assetsTotal] = counts.map(Number);
  assert.ok(routesWritten > 0);
  assert.ok(assetsWritten > 0);
  assert.equal(routesWritten, routesTotal);
  assert.equal(assetsWritten, assetsTotal);
  const files = (fs.readdirSync(outDir, { recursive: true }) as string[]).filter(file => fs.statSync(path.join(outDir, file)).isFile());
  const assetFiles = files.filter(file => /^(theme-assets|agent-icons|m)\//.test(file));
  assert.equal(assetFiles.length, assetsWritten, "reported assets match independently inspected files");
  assert.equal(files.length - assetFiles.length, routesWritten, "reported routes match independently inspected files");
  const assetUrls = [...home.matchAll(/(?:href|src)="(\/theme-assets\/[^"?#]+)"/g)].map(match => match[1]);
  assert.ok(assetUrls.length > 0);
  for (const url of assetUrls) assert.ok(fs.statSync(path.join(outDir, url.slice(1))).size > 0, `${url} must be exported with content`);
});

test("tovu export: a non-empty --out preserves unrelated files unless --clean is passed", (t) => {
  const parent = mkTempParent();
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const installDir = path.join(parent, "site");
  const outDir = path.join(parent, "out");

  assert.equal(runCli(["init", installDir]).status, 0);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "stale.html"), "leftover", "utf8");

  const preserved = runCli(["export", installDir, "--out", outDir]);
  assert.equal(preserved.status, 0, `stderr: ${preserved.stderr}`);
  assert.equal(fs.readFileSync(path.join(outDir, "stale.html"), "utf8"), "leftover");
  assert.ok(fs.existsSync(path.join(outDir, "index.html")));

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

  const homePath = path.join(installDir, "themes", "static", "tovu-starter", "render", "pages", "index.html");
  const probes = '<link id="audit-css" rel="stylesheet" href="/theme-assets/tovu-starter/css/theme.css"><script id="audit-js" src="/theme-assets/tovu-starter/scripts/main.js"></script><img id="audit-image" src="/theme-assets/tovu-starter/assets/logo.png">';
  fs.writeFileSync(homePath, fs.readFileSync(homePath, "utf8").replace("</body>", `${probes}</body>`));
  const result = runCli(["export", installDir, "--out", outDir, "--base-path", "/my-repo"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /rewrote root-relative links\/assets for base path '\/my-repo'/);
  assert.match(result.stderr, /warning:.*best-effort TEXT rewrite/, "the disclosed rewrite-limit warning must print when a base path is set");

  const home = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  assert.match(home, /href="\/my-repo\//, "at least one internal link must carry the base path");
  assert.match(home, /id="audit-css" rel="stylesheet" href="\/my-repo\/theme-assets\/tovu-starter\/css\/theme.css"/);
  assert.match(home, /id="audit-js" src="\/my-repo\/theme-assets\/tovu-starter\/scripts\/main.js"/);
  assert.match(home, /id="audit-image" src="\/my-repo\/theme-assets\/tovu-starter\/assets\/logo.png"/);
  assert.doesNotMatch(home, /\b(?:href|src)=["']\/(?!\/|my-repo(?:\/|["']))/, "all root-relative href/src values must carry the requested base path");
});

test("tovu export: TOVU_EXPORT_DIR env var sets the default output directory when --out is omitted", (t) => {
  const parent = mkTempParent();
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const installDir = path.join(parent, "site");
  const envOutDir = path.join(parent, "env-out");

  assert.equal(runCli(["init", installDir]).status, 0);

  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, "export", installDir], {
    encoding: "utf8",
    timeout: 120000, // see runCli's own doc above: safety net, not an expectation
    env: { ...childProcessCoverageEnv(WORKER_COVERAGE_DIR), TOVU_EXPORT_DIR: envOutDir },
  });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(fs.existsSync(path.join(envOutDir, "index.html")), "export must land under TOVU_EXPORT_DIR");
});

test("tovu export <dir>: with neither --out nor TOVU_EXPORT_DIR, the export lands under <dir>/out/export even when run from another directory", (t) => {
  const parent = mkTempParent();
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const installDir = path.join(parent, "site");
  // The operator's shell: not the install dir, and not its parent. The old default resolved the
  // export root from here (`<cwd>/sites/<name>/out/export`).
  const elsewhere = path.join(parent, "elsewhere");
  fs.mkdirSync(elsewhere);

  assert.equal(runCli(["init", installDir]).status, 0);

  const env: NodeJS.ProcessEnv = { ...childProcessCoverageEnv(WORKER_COVERAGE_DIR) };
  for (const key of ["TOVU_EXPORT_DIR", "TOVU_SITE_DIR", "TOVU_SITE"]) delete env[key];
  // A relative tsconfig path would resolve against `elsewhere`.
  if (env.TSX_TSCONFIG_PATH !== undefined) env.TSX_TSCONFIG_PATH = path.resolve(env.TSX_TSCONFIG_PATH);
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, "export", installDir], {
    encoding: "utf8",
    timeout: 120000, // see runCli's own doc above: safety net, not an expectation
    cwd: elsewhere,
    env,
  });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(fs.existsSync(path.join(installDir, "out", "export", "index.html")), "export must land under the exported site's own out/export");
  const strayExports = (fs.readdirSync(elsewhere, { recursive: true }) as string[]).filter((entry) => entry.endsWith(path.join("out", "export")));
  assert.deepEqual(strayExports, [], "nothing may be exported under the working directory");
});
