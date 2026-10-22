import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadTheme } from "../theme.js";
import { applicableThemeTemplates, parseTemplateFor } from "../template-applicability.js";
import { validateManifestV2 } from "../validation/manifest-v2.js";

const templates = ["post.html", "shared.html", "page.html", "both.html"];
const templateFor = { "post.html": ["post"], "page.html": ["page"], "both.html": ["post", "page"] } as const;

test("templateFor: schema accepts declared kinds and loader preserves the mapping", (t) => {
  const raw = { apiVersion: 2, id: "fixture", name: "Fixture", version: "1.0.0", templates, templateFor };
  assert.deepEqual(validateManifestV2({ raw }), []);
  const root = mkdtempSync(join(tmpdir(), "tovu-templatefor-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // A templated fixture isolates manifest parsing from static HTML conformance.
  mkdirSync(join(root, "templates"));
  writeFileSync(join(root, "theme.json"), JSON.stringify({ ...raw, tier: "templated" }));
  writeFileSync(join(root, "tokens.json"), "{}");
  writeFileSync(join(root, "templates", "home.liquid"), "Home");
  writeFileSync(join(root, "templates", "entry.liquid"), "Entry");
  const loaded = loadTheme({ themeDir: root, id: "fixture", source: "site" });
  assert.deepEqual(loaded.manifest.templateFor, templateFor);
  writeFileSync(join(root, "theme.json"), JSON.stringify({ ...raw, templateFor: { "post.html": ["product"] } }));
  const invalid = loadTheme({ themeDir: root, id: "fixture", source: "site" });
  assert.equal(invalid.status, "invalid");
  assert.ok(invalid.errors.some((error) => error.includes("templateFor")));
});

for (const value of [null, [], "post", { "post.html": "post" }, { "post.html": [] }, { "post.html": ["product"] }, { "post.html": ["post", "post"] }, { "missing.html": ["page"] }]) {
  test(`templateFor: schema and loader parser reject ${JSON.stringify(value)}`, () => {
    const raw = { apiVersion: 2, id: "fixture", name: "Fixture", version: "1.0.0", templates, templateFor: value };
    assert.ok(validateManifestV2({ raw }).some((issue) => issue.ruleId === "v2-template-for"));
    assert.throws(() => parseTemplateFor({ value, templates }), /templateFor/);
  });
}

test("templateFor: filters by kind in manifest order, sharing omitted and explicitly dual-kind entries", () => {
  const manifest = { templates, templateFor };
  assert.deepEqual(applicableThemeTemplates({ manifest, kind: "post" }), ["post.html", "shared.html", "both.html"]);
  assert.deepEqual(applicableThemeTemplates({ manifest, kind: "page" }), ["shared.html", "page.html", "both.html"]);
  assert.deepEqual(applicableThemeTemplates({ manifest: { templates }, kind: "post" }), templates);
  assert.deepEqual(applicableThemeTemplates({ manifest: { templates }, kind: "page" }), templates);
  assert.deepEqual(applicableThemeTemplates({ manifest }), templates);
  assert.deepEqual(applicableThemeTemplates({}), []);
});

test("templateFor: inherited object names remain unlisted and apply to both kinds", () => {
  const manifest = { templates: ["constructor", "toString"], templateFor: {} };
  for (const kind of ["post", "page"] as const) {
    assert.deepEqual(applicableThemeTemplates({ manifest, kind }), manifest.templates);
  }
});

test("templateFor without any declared templates: an empty mapping parses, any named template is refused", () => {
  assert.deepEqual(parseTemplateFor({ value: {} }), {});
  assert.throws(() => parseTemplateFor({ value: { "landing.html": ["page"] } }), {
    message: "theme.json templateFor 'landing.html' is not listed in templates",
  });
});
