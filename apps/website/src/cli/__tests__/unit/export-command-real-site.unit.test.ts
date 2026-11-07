import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { initSite } from "#src/server/runtime/composition/site-dir";
import { runExportCommand } from "../../commands/export.js";

/**
 * @file `tovu export` in-process with every default collaborator (real boot, composition,
 * migration reconciliation, export and close) against a freshly initialised site folder.
 */
test("exports a fresh site to static files with the default boot, composition and close", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-export-real-")); t.after(() => rm(root, { recursive: true, force: true }));
  const site = path.join(root, "site");
  await initSite({ dir: site, name: "Export Real Site" });
  const out = path.join(root, "out");
  const written: string[] = [];
  t.mock.method(process.stdout, "write", (chunk: string) => { written.push(String(chunk)); return true; });
  try {
    await runExportCommand({ dir: site, out });
  } finally { t.mock.restoreAll(); }
  const summaries = written.filter(chunk => chunk.startsWith("tovu export: wrote "));
  assert.equal(summaries.length, 1, "the CLI prints one export summary alongside boot diagnostics");
  const summary = summaries[0]!.match(/^tovu export: wrote (\d+)\/(\d+) routes and (\d+)\/(\d+) assets to (.+)\n$/);
  assert.ok(summary, "the CLI prints its route and asset summary");
  assert.equal(summary[1], summary[2], "every advertised route was exported");
  assert.equal(summary[3], summary[4], "every advertised asset was exported");
  assert.equal(summary[5], out);
  assert.ok(Number(summary[1]) > 0);
  assert.ok(existsSync(path.join(out, "index.html")), "the home page is exported");
  assert.ok(readdirSync(out).length > 0);
});
