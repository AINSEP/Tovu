import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { initSite } from "#src/platform/site-dir/init-site";
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
  assert.ok(existsSync(path.join(out, "index.html")), "the home page is exported");
  assert.ok(readdirSync(out).length > 0);
});
