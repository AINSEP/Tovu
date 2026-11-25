import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { isPortableSiteEntry } from "#src/platform/site-dir/layout";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { checkRawFilePath } from "../../publish-content/backstop-policy.js";
import { collectSiteBackupFiles, type SiteBackupSources } from "../../site-backup/sources.js";
import { routinesPaths } from "../routines-paths.js";

/**
 * @file The routine sidecar (`ops/routines.db`, its `-wal`/`-shm`) and the beacon are private: no
 * backup, portable copy or publish selector may carry them, including when content is relocated
 * into `data.nosync`. These pin the existing `ops/` precedent against the routine files' real
 * paths, as `routinesPaths` resolves them, so a path move that escaped `ops/` would fail here.
 */

function routineFiles({ contentDbPath }: { contentDbPath: string }): string[] {
  const { db, beacon } = routinesPaths({ contentDbPath });
  return [db, `${db}-wal`, `${db}-shm`, beacon];
}

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

test("backup with every scope on never includes routine files, at the site root or relocated", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "routines-private-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const planted = [
    ...routineFiles({ contentDbPath: path.join(root, "content.db") }),
    ...routineFiles({ contentDbPath: path.join(root, "data.nosync", "content.db") }),
  ];
  for (const file of planted) write(file, "PRIVATE");
  write(path.join(root, "uploads", "ws", "workspace-local", "blobs", "ab", "abcdef"), "IMG");
  write(path.join(root, "themes", "static", "demo", "index.html"), "<html>");
  write(path.join(root, "config.json"), JSON.stringify({ name: "Demo", domain: null, port: null }));
  const sources: SiteBackupSources = {
    siteDir: root,
    mediaUploadsDir: path.join(root, "uploads"),
    themesDir: path.join(root, "themes"),
    agentPlugins: resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "agent-plugins") } }),
    skillsDir: path.join(root, "skills"),
    tovuVersion: "0.1.0",
  };
  const include = { database: true, media: true, themes: true, plugins: true, settings: true };
  const { files } = await collectSiteBackupFiles({ sources, include });
  assert.ok(files.length >= 2, "the backup still carries real site files");
  const carried = new Set(files.map((file) => path.resolve(file.absPath)));
  for (const file of planted) assert.equal(carried.has(path.resolve(file)), false, `${file} must not be backed up`);
  for (const file of files) assert.doesNotMatch(file.path, /routines/);
});

test("portable copy never selects the folders that hold routine files", () => {
  for (const entryName of ["ops", "data.nosync", "routines.db", "routines-beacon.json"]) {
    assert.equal(isPortableSiteEntry({ entryName }), false, `${entryName} must not be portable`);
  }
});

test("publish refuses every routine file path, at the site root or relocated", () => {
  const relPaths = [
    "ops/routines.db", "ops/routines.db-wal", "ops/routines.db-shm", "ops/routines-beacon.json",
    "data.nosync/ops/routines.db", "data.nosync/ops/routines.db-wal", "data.nosync/ops/routines.db-shm", "data.nosync/ops/routines-beacon.json",
  ];
  for (const relPath of relPaths) {
    const refusal = checkRawFilePath({ relPath });
    assert.match(refusal ?? "", /never (?:sent|published)/, `${relPath} must not be published`);
  }
});
