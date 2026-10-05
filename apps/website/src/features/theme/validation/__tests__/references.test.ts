import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDeclaredReferences } from "../references.js";

// F7.2/F4.4: real isolated files distinguish missing variants from valid sources.
test("variants and page sources are checked against disk with exact logical ownership", (t) => {
  const themeDir = mkdtempSync(join(tmpdir(), "tovu-b10-references-"));
  t.after(() => rmSync(themeDir, { recursive: true, force: true }));
  writeFileSync(join(themeDir, "home.html"), "home");
  writeFileSync(join(themeDir, "compact.html"), "compact");
  assert.deepEqual(checkDeclaredReferences({ themeDir, fieldName: "renderer.pages", entries: {
    home: { source: "home.html", variants: { compact: "compact.html", missing: "absent.html", ignored: 8 } },
    ignored: null,
  } }), [{ ruleId: "references-missing-file", path: "absent.html", message: "renderer.pages.home references 'absent.html', which does not exist in this theme package" }]);
  assert.deepEqual(checkDeclaredReferences({ themeDir, fieldName: "partials", entries: {
    nav: { source: "home.html" }, footer: { variants: { small: "home.html" } },
  } }), [{ ruleId: "references-duplicate-source", path: "home.html", message: "partials entries [nav, footer] all reference the same file 'home.html' — each logical id should have its own source, or this is a copy-paste error" }]);
  assert.deepEqual(checkDeclaredReferences({ themeDir, fieldName: "partials", entries: { nav: { source: "home.html", variants: { small: "compact.html" } } } }), []);
});

test("non-object maps and non-source entries produce no reference findings", () => {
  for (const entries of [null, [], "not a map", { ignored: 7, list: [], source: { source: 8, variants: [] } }]) {
    assert.deepEqual(checkDeclaredReferences({ themeDir: "/unused", fieldName: "partials", entries }), []);
  }
});

// BUG (F4.4): reuse within one logical id is not a collision between different owners.
test("one partial may reuse its own source for a variant without a duplicate-owner finding", (t) => {
  const themeDir = mkdtempSync(join(tmpdir(), "tovu-b10-reference-owner-"));
  t.after(() => rmSync(themeDir, { recursive: true, force: true }));
  writeFileSync(join(themeDir, "nav.html"), "navigation");
  assert.deepEqual(checkDeclaredReferences({ themeDir, fieldName: "partials", entries: {
    nav: { source: "nav.html", variants: { default: "nav.html" } },
  } }), []);
});

test("repeated variants count each logical owner once for both manifest maps", (t) => {
  const themeDir = mkdtempSync(join(tmpdir(), "tovu-b10-reference-distinct-owners-"));
  t.after(() => rmSync(themeDir, { recursive: true, force: true }));
  writeFileSync(join(themeDir, "shared.html"), "shared");
  for (const fieldName of ["partials", "renderer.pages"]) {
    const nav = { variants: { default: "shared.html", compact: "shared.html" } };
    assert.deepEqual(checkDeclaredReferences({ themeDir, fieldName, entries: { nav } }), []);
    assert.deepEqual(checkDeclaredReferences({ themeDir, fieldName, entries: {
      nav, footer: { source: "shared.html", variants: { default: "shared.html" } },
    } }), [{
      ruleId: "references-duplicate-source", path: "shared.html",
      message: `${fieldName} entries [nav, footer] all reference the same file 'shared.html' — each logical id should have its own source, or this is a copy-paste error`,
    }]);
  }
});
