import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * @file `tovu theme normalize-build <dir>` — process-spawn integration tier, mirroring
 * `theme-migrate-command.integration.test.ts`'s convention. `code-tier-asset-normalizer.ts`'s own
 * planning/rewriting logic is certified in `src/features/theme/__tests__/code-tier-asset-normalizer.test.ts`;
 * this file proves the CLI WIRE that module's file header previously flagged as missing (Milestone 4,
 * 2026-08-18) — argv parsing, exit codes, `--pages`, `--json` vs. human-readable output, and that a
 * precondition violation surfaces through the real `cli/errors.ts` mapping rather than a silent no-op.
 */

const CLI_MAIN = path.resolve(__dirname, "../../main.ts");

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI_MAIN, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function writeFlatBuildOutput(dir: string): void {
  fs.writeFileSync(path.join(dir, "styles.css"), "body{background:url(favicon.ico)}", "utf8");
  fs.writeFileSync(path.join(dir, "main.js"), "console.log(1)", "utf8");
  fs.writeFileSync(path.join(dir, "favicon.ico"), "not-a-real-icon", "utf8");
  fs.writeFileSync(
    path.join(dir, "index.html"),
    '<head><link rel="stylesheet" href="styles.css"></head><body><script src="main.js" type="module"></script></body>',
    "utf8"
  );
}

test("tovu theme normalize-build <dir> --primary-stylesheet styles.css: relocates assets and rewrites the page in place, exits 0", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-normalize-ok-"));
  writeFlatBuildOutput(dir);

  const result = runCli(["theme", "normalize-build", dir, "--primary-stylesheet", "styles.css"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /moved styles\.css -> css\/styles\.css/);
  assert.match(result.stdout, /moved main\.js -> js\/main\.js/);
  assert.match(result.stdout, /rewrote index\.html/);

  assert.ok(fs.existsSync(path.join(dir, "css", "styles.css")));
  assert.ok(fs.existsSync(path.join(dir, "js", "main.js")));
  assert.ok(!fs.existsSync(path.join(dir, "styles.css")), "original flat file must have moved, not copied");

  const rewrittenIndex = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(!rewrittenIndex.includes('<link rel="stylesheet" href="styles.css">'), "plain build-output tag must be gone");
  assert.ok(rewrittenIndex.includes('<script src="../js/main.js" type="module"></script>'));

  const relocatedCss = fs.readFileSync(path.join(dir, "css", "styles.css"), "utf8");
  assert.ok(relocatedCss.includes("url(../favicon.ico)"), "relocated CSS's own url() must compensate for the directory shift");
});

test("tovu theme normalize-build <dir> --json: prints the machine-readable plan and result", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-normalize-json-"));
  writeFlatBuildOutput(dir);

  const result = runCli(["theme", "normalize-build", dir, "--primary-stylesheet", "styles.css", "--json"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(
    [...parsed.plan.relocations].sort((a: { from: string }, b: { from: string }) => a.from.localeCompare(b.from)),
    [
      { from: "main.js", to: "js/main.js" },
      { from: "styles.css", to: "css/styles.css" },
    ]
  );
  assert.deepEqual(parsed.rewrittenPageFiles, ["index.html"]);
  assert.deepEqual(parsed.discardedFiles, []);
});

test("tovu theme normalize-build <dir>: missing --primary-stylesheet exits 2 (VALIDATION) and never touches the directory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-normalize-missing-flag-"));
  writeFlatBuildOutput(dir);

  const result = runCli(["theme", "normalize-build", dir]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /^tovu: VALIDATION:/m);
  assert.ok(fs.existsSync(path.join(dir, "styles.css")), "must not mutate the build output before validating options");
});

test("tovu theme normalize-build <dir> --pages a.html,b.html: rewrites every named page file, defaulting off just index.html", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-normalize-multipage-"));
  fs.writeFileSync(path.join(dir, "styles.css"), "body{}", "utf8");
  const page = '<link rel="stylesheet" href="styles.css">';
  fs.writeFileSync(path.join(dir, "a.html"), page, "utf8");
  fs.writeFileSync(path.join(dir, "b.html"), page, "utf8");

  const result = runCli(["theme", "normalize-build", dir, "--primary-stylesheet", "styles.css", "--pages", "a.html,b.html"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);

  for (const page of ["a.html", "b.html"]) {
    const rewritten = fs.readFileSync(path.join(dir, page), "utf8");
    assert.ok(!rewritten.includes('href="styles.css"'), `${page} must have been rewritten`);
  }
});

test("tovu theme normalize-build <dir>: a precondition violation (Beasties-shape critical-CSS inlining left enabled) surfaces as INTERNAL, not a silent no-op", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-theme-normalize-beasties-"));
  fs.writeFileSync(path.join(dir, "styles.css"), "body{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "index.html"),
    '<style>body{margin:0}</style><link rel="stylesheet" href="styles.css" media="print" onload="this.media=\'all\'">',
    "utf8"
  );

  const result = runCli(["theme", "normalize-build", dir, "--primary-stylesheet", "styles.css"]);
  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /^tovu: INTERNAL:/m);
  assert.match(result.stderr, /expected the plain build-output tag/);
});
