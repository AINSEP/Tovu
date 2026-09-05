import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkApprovedRoots, checkSourceDirContainment, walkThemePackage } from "../structure.js";

/**
 * @file Direct-invoke unit coverage for `structure.ts`'s low-level filesystem-bounds and
 * path-containment branches. `validate-theme-package.test.ts` already certifies this module's
 * behavior-visible outcomes (`structure-unapproved-root`, `structure-sourcedir-generated-conflict`,
 * `structure-sourcedir-root-conflict`) through the public `validateThemePackage()` entry point; the
 * branches here are the ones that entry point cannot reach at all (see below) or can reach only by
 * constructing filesystem states — a 4001-file directory, a 17-level-deep tree, a chmod'd-unreadable
 * directory, a real and a broken symlink — that would make the aggregator suite slow and noisy to read.
 * Calling `structure.ts`'s exports directly keeps those fixtures scoped to exactly the branch each one
 * proves.
 */

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ---------------------------------------------------------------------------
// walkThemePackage — bounds and symlink handling
// ---------------------------------------------------------------------------

test("walkThemePackage: a real symlink inside the package is refused (structure-symlink-forbidden)", () => {
  const dir = tmpDir("tovu-structure-symlink-");
  const target = tmpDir("tovu-structure-symlink-target-");
  fs.writeFileSync(path.join(target, "real.txt"), "x", "utf8");
  fs.symlinkSync(path.join(target, "real.txt"), path.join(dir, "linked.txt"));

  // Passes the optional second parameter explicitly (rather than omitting it) so both the
  // default-applied and default-omitted arms of every exported function's `_optional` parameter here
  // get exercised somewhere in this suite.
  const result = walkThemePackage({ themeDir: dir }, {});
  const issue = result.issues.find((i) => i.ruleId === "structure-symlink-forbidden");
  assert.ok(issue, JSON.stringify(result.issues));
  assert.match(issue!.message, /'linked\.txt' is a symlink/);
  // The symlink itself must not appear in the discovered file list.
  assert.equal(result.files.some((f) => f.relativePath === "linked.txt"), false);
});

test("walkThemePackage: a broken (dangling-target) symlink is silently skipped, not flagged — pinning current behavior, not endorsing it", () => {
  // `statSync(full, { throwIfNoEntry: false })` follows the link and returns `undefined` for a
  // dangling target BEFORE `visitPackageEntry` ever reaches the `realpathSync`-based symlink check
  // below it, so a broken symlink escapes `structure-symlink-forbidden` entirely — neither reported
  // as an issue nor listed as a file. Trigger: any theme package containing a symlink whose target has
  // been deleted or never existed. Blast radius: low — the entry is dropped rather than validated, so
  // a theme author cannot use a broken symlink to smuggle content past this check; the file is just
  // invisible to it.
  const dir = tmpDir("tovu-structure-broken-symlink-");
  fs.symlinkSync(path.join(dir, "does-not-exist.txt"), path.join(dir, "broken.txt"));

  const result = walkThemePackage({ themeDir: dir });
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.files, []);
});

test("walkThemePackage: a file over the 16 MiB ceiling is reported (structure-max-file-size)", () => {
  const dir = tmpDir("tovu-structure-oversize-");
  const oversizePath = path.join(dir, "big.bin");
  fs.writeFileSync(oversizePath, Buffer.alloc(16 * 1024 * 1024 + 1));

  const result = walkThemePackage({ themeDir: dir });
  const issue = result.issues.find((i) => i.ruleId === "structure-max-file-size");
  assert.ok(issue, JSON.stringify(result.issues));
  assert.match(issue!.message, /'big\.bin' is 16777217 bytes, exceeding the 16777216-byte per-file ceiling/);
  // An oversized file is still recorded as a file (the ceiling is a reported issue, not an exclusion).
  assert.ok(result.files.some((f) => f.relativePath === "big.bin"));
});

test("walkThemePackage: a package nested past the 16-directory depth ceiling is reported (structure-max-depth)", () => {
  const dir = tmpDir("tovu-structure-depth-");
  let deepest = dir;
  for (let i = 0; i < 17; i++) {
    deepest = path.join(deepest, `d${i}`);
  }
  fs.mkdirSync(deepest, { recursive: true });

  const result = walkThemePackage({ themeDir: dir });
  const issue = result.issues.find((i) => i.ruleId === "structure-max-depth");
  assert.ok(issue, JSON.stringify(result.issues));
  assert.match(issue!.message, /exceeds the 16-directory depth ceiling/);
});

test("walkThemePackage: a package over the 4000-file ceiling is truncated and reported (structure-max-files), and a sibling directory encountered after truncation is skipped", () => {
  const dir = tmpDir("tovu-structure-maxfiles-");
  // Alphabetically first: saturates the ceiling entirely from within this one subdirectory.
  const saturated = path.join(dir, "a-saturated");
  fs.mkdirSync(saturated);
  for (let i = 0; i < 4001; i++) {
    fs.writeFileSync(path.join(saturated, `f${i}.txt`), "", "utf8");
  }
  // Alphabetically after "a-saturated": by the time the top-level walk reaches this entry, `truncated`
  // is already `true`, so `walk()`'s own leading `if (truncated) return;` guard must fire for it.
  const after = path.join(dir, "b-after");
  fs.mkdirSync(after);
  fs.writeFileSync(path.join(after, "should-not-be-counted.txt"), "", "utf8");

  const result = walkThemePackage({ themeDir: dir });
  const issue = result.issues.find((i) => i.ruleId === "structure-max-files");
  assert.ok(issue, JSON.stringify(result.issues));
  assert.match(issue!.message, /exceeds the 4000-file ceiling/);
  assert.equal(result.files.some((f) => f.relativePath === "b-after/should-not-be-counted.txt"), false);
});

test("walkThemePackage: a non-regular, non-directory entry (a FIFO) is silently skipped — neither listed as a file nor flagged as an issue", () => {
  const dir = tmpDir("tovu-structure-fifo-");
  const fifoPath = path.join(dir, "pipe");
  execFileSync("mkfifo", [fifoPath]);

  const result = walkThemePackage({ themeDir: dir });
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.files, []);
});

test("walkThemePackage: an unreadable subdirectory is reported (structure-unreadable-dir) rather than throwing", () => {
  const dir = tmpDir("tovu-structure-unreadable-sub-");
  const locked = path.join(dir, "locked");
  fs.mkdirSync(locked);
  fs.writeFileSync(path.join(locked, "secret.txt"), "x", "utf8");
  fs.chmodSync(locked, 0o000);
  try {
    const result = walkThemePackage({ themeDir: dir });
    const issue = result.issues.find((i) => i.ruleId === "structure-unreadable-dir");
    assert.ok(issue, JSON.stringify(result.issues));
    assert.match(issue!.message, /cannot read directory 'locked'/);
  } finally {
    fs.chmodSync(locked, 0o755);
  }
});

// ---------------------------------------------------------------------------
// checkApprovedRoots
// ---------------------------------------------------------------------------

test("checkApprovedRoots: the install-local .tovu-lineage.json sidecar is approved even though no publisher manifest ever declares it", () => {
  const dir = tmpDir("tovu-structure-lineage-");
  fs.writeFileSync(path.join(dir, ".tovu-lineage.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "theme.json"), "{}", "utf8");

  const issues = checkApprovedRoots({ themeDir: dir });
  assert.deepEqual(issues, []);
});

test("checkApprovedRoots: a tokens.<mode>.json root file matches the pattern and is approved", () => {
  const dir = tmpDir("tovu-structure-tokensmode-");
  fs.writeFileSync(path.join(dir, "tokens.light.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "theme.json"), "{}", "utf8");

  const issues = checkApprovedRoots({ themeDir: dir }, {});
  assert.deepEqual(issues, []);
});

test("checkApprovedRoots: an unreadable theme directory is reported (structure-unreadable-dir) rather than throwing", () => {
  const parent = tmpDir("tovu-structure-checkroots-unreadable-");
  const dir = path.join(parent, "theme");
  fs.mkdirSync(dir);
  fs.chmodSync(dir, 0o000);
  try {
    const issues = checkApprovedRoots({ themeDir: dir });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].ruleId, "structure-unreadable-dir");
    assert.match(issues[0].message, /cannot read theme directory/);
  } finally {
    fs.chmodSync(dir, 0o755);
  }
});

// ---------------------------------------------------------------------------
// checkSourceDirContainment / normalizeSourceDirOrIssue / checkSourceDirRootConflict
// ---------------------------------------------------------------------------

test("checkSourceDirContainment: build.source !== 'compiled' is a no-op regardless of sourceDir", () => {
  const issues = checkSourceDirContainment(
    {
      build: { source: "authored", sourceDir: "css" },
      schemaVersion: 2,
    },
    {}
  );
  assert.deepEqual(issues, []);
});

test("checkSourceDirContainment: build.source 'compiled' with no sourceDir is a no-op", () => {
  const issues = checkSourceDirContainment({
    build: { source: "compiled", sourceDir: undefined },
    schemaVersion: 2,
  });
  assert.deepEqual(issues, []);
});

test("checkSourceDirContainment: an absolute sourceDir is refused (structure-sourcedir-escapes)", () => {
  const issues = checkSourceDirContainment({
    build: { source: "compiled", sourceDir: "/etc/src" },
    schemaVersion: 2,
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].ruleId, "structure-sourcedir-escapes");
  assert.match(issues[0].message, /must be a relative, contained path/);
});

test("checkSourceDirContainment: a sourceDir containing '..' is refused (structure-sourcedir-escapes)", () => {
  const issues = checkSourceDirContainment({
    build: { source: "compiled", sourceDir: "../outside" },
    schemaVersion: 2,
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].ruleId, "structure-sourcedir-escapes");
});

test("checkSourceDirContainment: a sourceDir that normalizes to the theme root ('./') is refused (structure-sourcedir-root)", () => {
  const issues = checkSourceDirContainment({
    build: { source: "compiled", sourceDir: "./" },
    schemaVersion: 2,
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].ruleId, "structure-sourcedir-root");
  assert.match(issues[0].message, /must not be the theme root itself/);
});

test("checkSourceDirContainment: a sourceDir of exactly '.' is refused (structure-sourcedir-root)", () => {
  const issues = checkSourceDirContainment({
    build: { source: "compiled", sourceDir: "." },
    schemaVersion: 2,
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].ruleId, "structure-sourcedir-root");
});

test("checkSourceDirContainment: a v2 sourceDir naming no reserved root and no generated dir passes clean", () => {
  const issues = checkSourceDirContainment({
    build: { source: "compiled", sourceDir: "src" },
    schemaVersion: 2,
  });
  assert.deepEqual(issues, []);
});

// A "schemaVersion: 1 skips the v2-only root-conflict rule" case used to be pinned here, direct-invoke
// only, because no real caller ever passed `schemaVersion: 1` — confirmed by exhaustively tracing
// every call site (`checkSourceDirContainment`'s own doc comment). `schemaVersion` is now typed as the
// literal `2`, so that case is no longer constructible at all; removed along with the type value it
// existed only to pin.
