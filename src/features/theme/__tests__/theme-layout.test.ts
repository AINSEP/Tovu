import assert from "node:assert/strict";
import test from "node:test";

import { isPageFilePath, isPartialFilePath, resolveThemeLayout } from "../theme-layout.js";

/**
 * @file `resolveThemeLayout`/`isPageFilePath`/`isPartialFilePath` — the one apiVersion-aware theme
 * layout resolver every consumer of theme paths (server route, admin SPA, the loader, the missing-
 * template diagnostic, the static portability generator) now imports instead of re-deriving its own
 * copy of "where does a v2 theme keep its pages" (2026-08-19 architecture audit, findings 1 & 2).
 */

test("resolveThemeLayout: v1 (apiVersion absent) resolves the flat layout", () => {
  const layout = resolveThemeLayout(undefined);
  assert.equal(layout.pagesDir, "pages");
  assert.equal(layout.partialsDir, "");
  assert.equal(layout.scriptsDir, "js");
  assert.equal(layout.cssDir, "css");
  assert.equal(layout.stylesheetFilename, "styles.css");
  assert.equal(layout.stylesheetPath, "css/styles.css");
  assert.equal(layout.indexPagePath, "pages/index.html");
  assert.deepEqual(layout.requiredFiles, ["pages/index.html", "theme.json", "tokens.json"]);
});

test("resolveThemeLayout: v2 (apiVersion: 2) resolves the nested layout", () => {
  const layout = resolveThemeLayout(2);
  assert.equal(layout.pagesDir, "render/pages");
  assert.equal(layout.partialsDir, "render/partials");
  assert.equal(layout.scriptsDir, "scripts");
  assert.equal(layout.cssDir, "css");
  assert.equal(layout.stylesheetFilename, "theme.css");
  assert.equal(layout.stylesheetPath, "css/theme.css");
  assert.equal(layout.indexPagePath, "render/pages/index.html");
  assert.deepEqual(layout.requiredFiles, ["render/pages/index.html", "theme.json", "tokens.json"]);
});

test("isPageFilePath: v1 matches pages/ prefix, not render/pages/", () => {
  assert.equal(isPageFilePath("pages/about.html", undefined), true);
  assert.equal(isPageFilePath("pages/index.html", undefined), true);
  assert.equal(isPageFilePath("render/pages/about.html", undefined), false);
  assert.equal(isPageFilePath("css/pages/x.css", undefined), false);
});

test("isPageFilePath: v2 matches render/pages/ prefix, not bare pages/", () => {
  assert.equal(isPageFilePath("render/pages/about.html", 2), true);
  assert.equal(isPageFilePath("render/pages/index.html", 2), true);
  assert.equal(isPageFilePath("pages/about.html", 2), false);
});

test("isPartialFilePath: v1 matches a root .html file with no slash, not a nested one", () => {
  assert.equal(isPartialFilePath("nav.html", undefined), true);
  assert.equal(isPartialFilePath("footer-minimal.html", undefined), true);
  assert.equal(isPartialFilePath("render/partials/nav.html", undefined), false);
  assert.equal(isPartialFilePath("pages/index.html", undefined), false);
  assert.equal(isPartialFilePath("nav.json", undefined), false);
});

test("isPartialFilePath: v2 matches render/partials/*.html, not a bare root .html file", () => {
  assert.equal(isPartialFilePath("render/partials/nav.html", 2), true);
  assert.equal(isPartialFilePath("render/partials/footer-minimal.html", 2), true);
  assert.equal(isPartialFilePath("nav.html", 2), false);
  assert.equal(isPartialFilePath("render/pages/index.html", 2), false);
});
