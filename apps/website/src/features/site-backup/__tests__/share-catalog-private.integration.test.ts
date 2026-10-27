/**
 * @file The share catalog (ZIPs + records) lives in the site's private `ops/shares` beside its database
 * (`<site>/ops/shares` or `<site>/data.nosync/ops/shares`). This pins the exclusions that make that safe:
 * a backup or share export never collects it, Duplicate never copies it, and the publish backstop never
 * sends it. Served roots are the content folders; `deps.ts` refuses a catalog inside any of them.
 */
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkRawFilePath } from "#src/features/publish-content/backstop-policy";
import { isPortableSiteEntry } from "#src/platform/site-dir/layout";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { collectSiteBackupFiles } from "../sources.js";

const CATALOGS = [path.join("ops", "shares"), path.join("data.nosync", "ops", "shares")];
const SHARE_ID = "0b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e";

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

test("a backup and a share export never collect a share catalog, in any scope", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "share-catalog-private-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  write(path.join(root, ".site-meta.json"), JSON.stringify({ siteId: "s1" }));
  write(path.join(root, "themes", "static", "demo", "index.html"), "<html>");
  for (const catalog of CATALOGS) {
    write(path.join(root, catalog, `${SHARE_ID}.json`), "{}");
    write(path.join(root, catalog, `${SHARE_ID}.tovu.zip`), "PK");
  }
  const sources = { siteDir: root, mediaUploadsDir: path.join(root, "uploads"), themesDir: path.join(root, "themes"),
    agentPlugins: resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "agent-plugins") } }), skillsDir: path.join(root, "skills"), tovuVersion: "test" };
  const include = { database: false, media: true, themes: true, plugins: true, settings: true };
  for (const profile of [undefined, "share"] as const) {
    const collected = await collectSiteBackupFiles({ sources, include }, profile ? { profile } : {});
    assert.ok(collected.files.some(file => file.path.startsWith("themes/")), "sanity: the walk ran");
    assert.deepEqual(collected.files.filter(file => file.absPath.includes(`${path.sep}ops${path.sep}`)).map(file => file.path), [], `${profile ?? "backup"} profile`);
  }
});

test("Duplicate never copies the folders that hold a share catalog", () => {
  for (const entry of ["ops", "data.nosync"]) assert.equal(isPortableSiteEntry(entry), false, entry);
});

test("the publish backstop refuses a share catalog file at any depth", () => {
  for (const catalog of CATALOGS) for (const name of [`${SHARE_ID}.json`, `${SHARE_ID}.tovu.zip`]) {
    const relPath = `${catalog.split(path.sep).join("/")}/${name}`;
    assert.notEqual(checkRawFilePath({ relPath }), null, relPath);
  }
});
