import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkBuiltThemeConformance } from "../build-conformance";

/**
 * @file Direct unit coverage of `checkBuiltThemeConformance` itself — `theme-compiled-load-gate.test.ts`
 * covers it through the real `loadTheme()` install path; this file isolates branches that path doesn't
 * reach on its own: an island hiding inside a PARTIAL (nav/footer), and the shape of a returned
 * `ConformanceIssue` when a page trips more than one rule at once.
 */

const SENTINEL = '<link rel="stylesheet" href="../css/styles.css" />';

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

test("no pages, no partials, no hashes -> no issues", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  const issues = checkBuiltThemeConformance({ themeId: "empty", themeDir: root, pages: {}, partials: {}, artifactHashes: {} });
  assert.deepEqual(issues, []);
});

test("an island hidden inside a PARTIAL (e.g. a header's cart icon) is checked, same as a page", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  const issues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    pages: {},
    partials: { nav: '<nav><div data-tovu-island="cart"></div></nav>' },
    artifactHashes: {},
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "island-content");
  assert.equal(issues[0].page, "nav");
});

test("a partial's own content is NOT checked for the stylesheet sentinel or asset paths (only pages are)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  // Neither a sentinel nor a rewritable-asset check applies to a bare partial fragment — the runtime
  // only requires the sentinel on a full PAGE (renderStaticPartial wraps a partial in its own host
  // document that already supplies one). A partial with no sentinel and a raw asset href must not be
  // flagged by rules that only make sense for a complete page document.
  const issues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    pages: {},
    partials: { footer: '<footer><link rel="stylesheet" href=../css/x.css /></footer>' },
    artifactHashes: {},
  });
  assert.deepEqual(issues, []);
});

test("a page tripping the sentinel, asset-path, and island rules simultaneously reports one issue per rule, correctly attributed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  const html =
    '<html><head><link rel="stylesheet" href=../css/x.css /></head>' +
    '<body><div data-tovu-island="widget"></div></body></html>'; // sentinel entirely absent too

  const issues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    pages: { index: html },
    partials: {},
    artifactHashes: {},
  });

  const rules = issues.map((i) => i.rule).sort();
  assert.deepEqual(rules, ["asset-path", "island-content", "stylesheet-sentinel"]);
  for (const issue of issues) {
    assert.equal(issue.page, "index");
  }
});

test("artifactHashes verification reads real bytes off themeDir, independent of which page/partial they belong to", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  fs.mkdirSync(path.join(root, "js"), { recursive: true });
  fs.writeFileSync(path.join(root, "js", "main.js"), "console.log(1)", "utf8");

  const okIssues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    pages: {},
    partials: {},
    artifactHashes: { "js/main.js": sha256("console.log(1)") },
  });
  assert.deepEqual(okIssues, []);

  const mismatchIssues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    pages: {},
    partials: {},
    artifactHashes: { "js/main.js": sha256("console.log(2)") },
  });
  assert.equal(mismatchIssues.length, 1);
  assert.equal(mismatchIssues[0].rule, "artifact-hash");
  assert.equal(mismatchIssues[0].page, "js/main.js");
});

test("a well-formed page (sentinel present once, only rewritable asset refs, filled islands) reports nothing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  const html = `<html><head>${SENTINEL}</head><body><div data-tovu-island="cart">1 item</div></body></html>`;

  const issues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    pages: { index: html },
    partials: {},
    artifactHashes: {},
  });
  assert.deepEqual(issues, []);
});

/**
 * @file (continued) Full-tree inventory + symlink rejection, promoted 2026-08-12 (see this module's
 * file header): the day untrusted publishers came into scope for themes, `checkArtifactHashes` stopped
 * verifying only the files `build.artifactHashes` LISTS and started accounting for every real file
 * under the generated region. These tests exercise that promotion directly — every one of them would
 * have reported ZERO issues under the prior "listed-file-only" implementation, since none of these
 * scenarios involve a listed hash that's missing or wrong.
 */

test("a real file present in the generated tree but NOT listed in artifactHashes is flagged as unlisted", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  fs.mkdirSync(path.join(root, "js"), { recursive: true });
  fs.writeFileSync(path.join(root, "js", "main.js"), "console.log(1)", "utf8");
  fs.writeFileSync(path.join(root, "js", "vendor.js"), "console.log(2)", "utf8"); // never hashed below

  const issues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    pages: {},
    partials: {},
    artifactHashes: { "js/main.js": sha256("console.log(1)") },
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "artifact-hash");
  assert.equal(issues[0].page, "js/vendor.js");
  assert.match(issues[0].message, /has no entry in build\.artifactHashes/);
});

test("a symlink anywhere in the generated tree is refused outright -- never followed, never hashed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  fs.mkdirSync(path.join(root, "js"), { recursive: true });
  const outsideTarget = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-outside-"));
  fs.writeFileSync(path.join(outsideTarget, "secret.js"), "top secret", "utf8");
  fs.symlinkSync(path.join(outsideTarget, "secret.js"), path.join(root, "js", "main.js"));

  const issues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    pages: {},
    partials: {},
    // Even a hash that would match the symlink TARGET's real bytes must not let it through --
    // the entry is refused by kind, before any hashing is attempted.
    artifactHashes: { "js/main.js": sha256("top secret") },
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "artifact-hash");
  assert.equal(issues[0].page, "js/main.js");
  assert.match(issues[0].message, /symbolic link/);
});

test("a symlinked DIRECTORY in the generated tree is refused and never descended into", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-outside-dir-"));
  fs.writeFileSync(path.join(outsideDir, "leaked.js"), "leaked", "utf8");
  fs.symlinkSync(outsideDir, path.join(root, "js"));

  const issues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    pages: {},
    partials: {},
    artifactHashes: {},
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "artifact-hash");
  assert.equal(issues[0].page, "js");
  assert.match(issues[0].message, /symbolic link/);
  // Nothing under the symlinked directory was walked, so `leaked.js` was never reported at all --
  // neither as a hash mismatch nor as an unlisted file.
  assert.ok(!issues.some((i) => i.page.includes("leaked.js")));
});

test("files inside build.sourceDir are excluded from the full-tree inventory -- not required to be listed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "Header.tsx"), "export const Header = () => null;", "utf8");

  const issues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    sourceDir: "src",
    pages: {},
    partials: {},
    artifactHashes: {}, // src/Header.tsx deliberately has no entry
  });

  assert.deepEqual(issues, []);
});

test("theme.json itself is excluded from the full-tree inventory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  fs.writeFileSync(path.join(root, "theme.json"), '{"id":"t"}', "utf8");

  const issues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    pages: {},
    partials: {},
    artifactHashes: {}, // theme.json deliberately has no entry
  });

  assert.deepEqual(issues, []);
});

test("an artifactHashes key shaped like a path-traversal string never reaches the filesystem outside themeDir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-traversal-"));
  fs.writeFileSync(path.join(outsideDir, "passwd"), "root:x:0:0", "utf8");

  // Prior to the full-tree-inventory rewrite, checkArtifactHashes resolved this key with
  // `join(themeDir, relativePath)` and called `readFileSync` on the result directly -- a `../`-shaped
  // key would have been read (and hash-compared) with no containment check at all. The rewrite walks
  // the tree itself and looks keys up in what it found, so a key that no real directory-entry chain
  // could ever produce simply reports "does not exist", the same as any other unmatched key.
  const traversalKey = "../".repeat(6) + path.relative(root, path.join(outsideDir, "passwd")).split(path.sep).join("/");

  const issues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    pages: {},
    partials: {},
    artifactHashes: { [traversalKey]: sha256("root:x:0:0") },
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "artifact-hash");
  assert.equal(issues[0].page, traversalKey);
  assert.match(issues[0].message, /does not exist on disk/);
});

test("a generated file over the per-file hash-verification byte cap is flagged rather than fully read into memory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conformance-unit-"));
  fs.mkdirSync(path.join(root, "js"), { recursive: true });
  const oversized = Buffer.alloc(16 * 1024 * 1024 + 1, "a");
  fs.writeFileSync(path.join(root, "js", "huge.js"), oversized);

  const issues = checkBuiltThemeConformance({
    themeId: "t",
    themeDir: root,
    pages: {},
    partials: {},
    artifactHashes: { "js/huge.js": sha256(oversized) },
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "artifact-hash");
  assert.equal(issues[0].page, "js/huge.js");
  assert.match(issues[0].message, /per-file verification cap/);
});
