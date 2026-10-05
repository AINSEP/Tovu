import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateManifest } from "../../../../manifest.js";
import {
  CONTENT_ANALYZER_BUILT_IN,
  CONTENT_ANALYZER_MANIFEST,
  CONTENT_ANALYZER_RUNTIME_SOURCE,
} from "../../index.js";

/**
 * @file `content-analyzer` built-in's manifest + runtime source: a valid tier-2 manifest, an
 * `entryPath` that points at the real worker entry module, and an `importModule` that refuses to
 * run plugin code in the server process.
 */

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("manifest: tier-2, fixed identity, one beforeSave hook, passes the one shared validator", () => {
  assert.equal(CONTENT_ANALYZER_MANIFEST.id, "content-analyzer");
  assert.equal(CONTENT_ANALYZER_MANIFEST.name, "Content Analyzer");
  assert.equal(CONTENT_ANALYZER_MANIFEST.tier, "tier-2");
  assert.equal(CONTENT_ANALYZER_MANIFEST.version, "1.0.0");
  assert.equal(CONTENT_ANALYZER_MANIFEST.sdkRange, "^0.1.0 || ^0.2.0");
  assert.equal(CONTENT_ANALYZER_MANIFEST.engine, 1);
  assert.deepEqual(CONTENT_ANALYZER_MANIFEST.hooks, ["content.entry.beforeSave"]);
  assert.deepEqual(validateManifest({ manifest: CONTENT_ANALYZER_MANIFEST, folderName: "content-analyzer", builtInIds: [] }).errors, []);
  assert.equal(CONTENT_ANALYZER_BUILT_IN.manifest, CONTENT_ANALYZER_MANIFEST);
});

test("manifest fields: the 6 ext paths, all non-queryable, typed, with search-friendly descriptions", () => {
  const fields = CONTENT_ANALYZER_MANIFEST.fields ?? [];
  assert.deepEqual(
    fields.map((f) => [f.path, f.type, f.queryable]),
    [
      ["ext.content-analyzer.score", "integer", false],
      ["ext.content-analyzer.wordCount", "integer", false],
      ["ext.content-analyzer.readingTimeMinutes", "integer", false],
      ["ext.content-analyzer.readability", "number", false],
      ["ext.content-analyzer.summary", "string", false],
      ["ext.content-analyzer.report", "string", false],
    ],
  );
  const searchText = fields.map((f) => f.description ?? "").join(" ").toLowerCase();
  for (const term of ["analyze", "seo", "readability", "reading time", "word count", "table of contents", "headings", "alt text"]) {
    assert.ok(searchText.includes(term), `descriptions should mention "${term}"`);
  }
  for (const f of fields) assert.ok((f.description ?? "").trim().length > 0, `${f.path} needs a description`);
});

test("runtime source: built-in, entryPath is the existing worker entry module in this folder, sourceDir is this folder", () => {
  assert.equal(CONTENT_ANALYZER_RUNTIME_SOURCE.manifest, CONTENT_ANALYZER_MANIFEST);
  assert.equal(CONTENT_ANALYZER_RUNTIME_SOURCE.source, "built-in");
  assert.equal(CONTENT_ANALYZER_RUNTIME_SOURCE.sourceDir, PLUGIN_DIR);
  assert.ok(path.isAbsolute(CONTENT_ANALYZER_RUNTIME_SOURCE.entryPath));
  assert.equal(path.dirname(CONTENT_ANALYZER_RUNTIME_SOURCE.entryPath), PLUGIN_DIR);
  // Under tsx this module runs as index.ts, so its entry module is plugin.ts (plugin.js in dist).
  assert.equal(path.basename(CONTENT_ANALYZER_RUNTIME_SOURCE.entryPath), "plugin.ts");
  assert.ok(existsSync(CONTENT_ANALYZER_RUNTIME_SOURCE.entryPath));
});

test("runtime source: importModule never runs tier-2 plugin code in the server process", async () => {
  await assert.rejects(CONTENT_ANALYZER_RUNTIME_SOURCE.importModule(), {
    message: "tier-2 plugin code never runs in the server process",
  });
});
