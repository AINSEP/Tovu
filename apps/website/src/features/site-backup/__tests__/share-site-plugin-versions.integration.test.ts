/**
 * @file A site plugin slot `plugins/<id>/` is either installed versions (`<version>/` folders whose
 * `jini.plugin.json` / legacy `tovu.plugin.json` names that same version, Jini's installer layout) or a
 * flat plugin whose slot root is the package. The share export classifies each slot once from those
 * manifests, exports only the active version (activation pin, else the latest), and maps every file to
 * `plugins/<id>/package/<path in the package>`. Real files through the real walk, extension
 * preparation and ZIP builder (a capturing encoder stands in for Jini's).
 */
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { prepareArchiveExtensions } from "../archive-extensions.js";
import type { SiteSharePlanContent } from "../plan-store.js";
import { buildShareZip } from "../share-zip.js";
import { collectSiteBackupFiles, type SiteBackupSources } from "../sources.js";

function site(t: TestContext, files: Record<string, string>, optional: { pins?: Record<string, string> } = {}): SiteBackupSources {
  const root = mkdtempSync(path.join(tmpdir(), "share-plugin-versions-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), text);
  }
  return { siteDir: root, mediaUploadsDir: null, themesDir: path.join(root, "themes"), skillsDir: path.join(root, "skills"), tovuVersion: "test",
    agentPlugins: resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "agent-plugins") } }),
    ...(optional.pins ? { sitePluginVersions: async () => new Map(Object.entries(optional.pins!)) } : {}) };
}

/** Archive path -> text of every plugin file the share ZIP would carry. */
async function exported(sources: SiteBackupSources): Promise<Record<string, string>> {
  const collected = await collectSiteBackupFiles({ sources, include: { database: false, media: false, themes: false, plugins: true, settings: false } }, { profile: "share" });
  const extensions = await prepareArchiveExtensions({ sources, files: collected.files });
  const picked: File[] = [];
  const zip: typeof zipFolderFiles = async ({ files }) => { picked.push(...files); return new File(["zip"], "share.zip"); };
  // A v2 manifest always names every scope, a database and settings; tiny stand-ins keep the focus on plugins.
  const plan: SiteSharePlanContent = { target: { kind: "zip" }, profile: "share", include: { database: true, media: true, themes: true, plugins: true, settings: true },
    database: { bytes: Buffer.from("db"), watermarkAtCapture: 1 }, files: extensions.files, bufferedFiles: [{ path: "settings.json", content: Buffer.from("{}") }],
    media: [], plugins: extensions.plugins, skipped: [], scopeNotes: {}, totalBytes: extensions.files.reduce((sum, file) => sum + file.bytes, 4),
    site: { name: "Site", folderName: "site" }, schema: { index: 1, tag: "test" }, tovuVersion: "test", createdAt: "2026-10-27" };
  await buildShareZip({ plan, zip }, { packageFiles: new Map() });
  const entries: Record<string, string> = {};
  for (const file of picked) {
    const archivePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath?.replace(/^share\//, "") ?? file.name;
    if (archivePath.startsWith("plugins/")) entries[archivePath] = await file.text();
  }
  return entries;
}

const manifest = (version: string) => JSON.stringify({ id: "multi", version });

// RED (design 2026-10-27): every version folder mapped to `plugins/<id>/package/...`, so after one upgrade
// the retained 1.0.0/ and 1.1.0/ both claimed `package/jini.plugin.json` and the whole export was refused.
test("two retained versions export only the latest, without its data/ or private memory", async t => {
  const sources = site(t, {
    "plugins/multi/1.0.0/jini.plugin.json": manifest("1.0.0"), "plugins/multi/1.0.0/index.js": "old",
    "plugins/multi/1.1.0/jini.plugin.json": manifest("1.1.0"), "plugins/multi/1.1.0/index.js": "new",
    "plugins/multi/1.1.0/data/token.json": "{}", "plugins/multi/1.1.0/memory/private/x.md": "private",
    "plugins/multi/1.1.0/memory/notes/help.md": "note", "plugins/multi/1.1.0/src/data/default.json": "content",
  });
  assert.deepEqual(await exported(sources), {
    "plugins/multi/package/jini.plugin.json": manifest("1.1.0"), "plugins/multi/package/index.js": "new",
    "plugins/multi/memory/notes/help.md": "note", "plugins/multi/package/src/data/default.json": "content",
  });
});

test("an activation pin to a retained version exports that version", async t => {
  const sources = site(t, {
    "plugins/multi/1.0.0/jini.plugin.json": manifest("1.0.0"), "plugins/multi/1.0.0/index.js": "old",
    "plugins/multi/1.1.0/jini.plugin.json": manifest("1.1.0"), "plugins/multi/1.1.0/index.js": "new",
  }, { pins: { multi: "1.0.0" } });
  assert.deepEqual(await exported(sources), { "plugins/multi/package/jini.plugin.json": manifest("1.0.0"), "plugins/multi/package/index.js": "old" });
});

// RED: a version-shaped folder name alone made `1.2.3/` a version, so a flat plugin's content folder lost
// its name and its nested data/ was dropped as private runtime data.
test("a flat plugin's version-shaped and dotted content folders keep their names and nested data/", async t => {
  const sources = site(t, {
    "plugins/flat/index.js": "root", "plugins/flat/1.2.3/help.js": "help", "plugins/flat/1.2.3/data/x.json": "nested",
    "plugins/flat/1.2.docs/index.js": "docs", "plugins/flat/1.0/readme.md": "no manifest, so content", "plugins/flat/data/token.json": "{}",
  });
  assert.deepEqual(await exported(sources), {
    "plugins/flat/package/index.js": "root", "plugins/flat/package/1.2.3/help.js": "help", "plugins/flat/package/1.2.3/data/x.json": "nested",
    "plugins/flat/package/1.2.docs/index.js": "docs", "plugins/flat/package/1.0/readme.md": "no manifest, so content",
  });
});

test("a legacy two-part version folder with a matching legacy manifest is still a version", async t => {
  const sources = site(t, {
    "plugins/legacy/1.0/tovu.plugin.json": JSON.stringify({ id: "legacy", version: "1.0" }), "plugins/legacy/1.0/index.js": "legacy",
    "plugins/legacy/1.0/data/token.json": "{}",
  });
  assert.deepEqual(await exported(sources), { "plugins/legacy/package/tovu.plugin.json": JSON.stringify({ id: "legacy", version: "1.0" }), "plugins/legacy/package/index.js": "legacy" });
});
