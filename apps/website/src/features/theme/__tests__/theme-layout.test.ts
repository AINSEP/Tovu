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
  const layout = resolveThemeLayout({}, { apiVersion: undefined });
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
  const layout = resolveThemeLayout({}, { apiVersion: 2 });
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
  assert.equal(isPageFilePath({ relativePath: "pages/about.html" }, { apiVersion: undefined }), true);
  assert.equal(isPageFilePath({ relativePath: "pages/index.html" }, { apiVersion: undefined }), true);
  assert.equal(isPageFilePath({ relativePath: "render/pages/about.html" }, { apiVersion: undefined }), false);
  assert.equal(isPageFilePath({ relativePath: "css/pages/x.css" }, { apiVersion: undefined }), false);
});

test("isPageFilePath: v2 matches render/pages/ prefix, not bare pages/", () => {
  assert.equal(isPageFilePath({ relativePath: "render/pages/about.html" }, { apiVersion: 2 }), true);
  assert.equal(isPageFilePath({ relativePath: "render/pages/index.html" }, { apiVersion: 2 }), true);
  assert.equal(isPageFilePath({ relativePath: "pages/about.html" }, { apiVersion: 2 }), false);
});

test("isPartialFilePath: v1 matches a root .html file with no slash, not a nested one", () => {
  assert.equal(isPartialFilePath({ relativePath: "nav.html" }, { apiVersion: undefined }), true);
  assert.equal(isPartialFilePath({ relativePath: "footer-minimal.html" }, { apiVersion: undefined }), true);
  assert.equal(isPartialFilePath({ relativePath: "render/partials/nav.html" }, { apiVersion: undefined }), false);
  assert.equal(isPartialFilePath({ relativePath: "pages/index.html" }, { apiVersion: undefined }), false);
  assert.equal(isPartialFilePath({ relativePath: "nav.json" }, { apiVersion: undefined }), false);
});

test("isPartialFilePath: v2 matches render/partials/*.html, not a bare root .html file", () => {
  assert.equal(isPartialFilePath({ relativePath: "render/partials/nav.html" }, { apiVersion: 2 }), true);
  assert.equal(isPartialFilePath({ relativePath: "render/partials/footer-minimal.html" }, { apiVersion: 2 }), true);
  assert.equal(isPartialFilePath({ relativePath: "nav.html" }, { apiVersion: 2 }), false);
  assert.equal(isPartialFilePath({ relativePath: "render/pages/index.html" }, { apiVersion: 2 }), false);
});
