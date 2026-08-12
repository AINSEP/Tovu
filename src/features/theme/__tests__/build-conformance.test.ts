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

function sha256(content: string): string {
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
