/**
 * @file Which site plugin files a share export carries. Jini owns the layout: its pinned discovery picks
 * the active version (a pin never falls forward) and `listSitePluginPackage` names the package (the
 * manifest plus exactly its integrity files), so nothing else under `plugins/` ships: not data/, private
 * memory, stray files, a flat or damaged folder. Each file's sha256 is checked against integrity; a
 * folder that is left out is named in the plugins scope note. Real files through Jini discovery (Tovu's
 * host binding), the walk, extension preparation and the ZIP builder (a capturing encoder stands in).
 */
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { prepareArchiveExtensions } from "../archive-extensions.js";
import type { ArchivePlugin } from "../archive-manifest.js";
import type { SiteSharePlanContent } from "../plan-store.js";
import { buildShareZip } from "../share-zip.js";
import { collectSiteBackupFiles, type SiteBackupSources } from "../sources.js";
import { installSitePlugin, jiniSitePlugins, sitePluginManifest } from "./fixtures/site-plugin.fixture.js";

function site(t: TestContext, optional: { pins?: Record<string, string> } = {}): { sources: SiteBackupSources; installDir: string; write: (files: Record<string, string>) => void } {
  const root = mkdtempSync(path.join(tmpdir(), "share-plugin-versions-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const installDir = path.join(root, "plugins");
  const write = (files: Record<string, string>) => {
    for (const [relative, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(installDir, relative)), { recursive: true });
      writeFileSync(path.join(installDir, relative), text);
    }
  };
  const sources: SiteBackupSources = { siteDir: root, mediaUploadsDir: null, themesDir: path.join(root, "themes"), skillsDir: path.join(root, "skills"), tovuVersion: "test",
    agentPlugins: resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "agent-plugins") } }), sitePlugins: jiniSitePlugins({ installDir }, optional) };
  return { sources, installDir, write };
}

/** Archive path -> text of every plugin file the share ZIP would carry, and the plugins scope note. */
async function exported(sources: SiteBackupSources, optional: { beforeEncode?: () => void } = {}): Promise<{ entries: Record<string, string>; note: string | undefined; plugins: readonly ArchivePlugin[] }> {
  const collected = await collectSiteBackupFiles({ sources, include: { database: false, media: false, themes: false, plugins: true, settings: false } }, { profile: "share" });
  const extensions = await prepareArchiveExtensions({ sources, files: collected.files });
  optional.beforeEncode?.();
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
  return { entries, note: collected.scopeNotes.plugins, plugins: extensions.plugins };
}

const PACKAGE = { "server/index.mjs": "export default {};", "src/data/default.json": "content" };
const RUNTIME = { "data/token.json": "oauth-token", "memory/private/x.md": "private", "memory/notes/help.md": "note", "stray.txt": "stray" };
const shipped = (id: string, version: string, files: Record<string, string> = PACKAGE) => ({
  [`plugins/${id}/package/jini.plugin.json`]: sitePluginManifest({ id, version, package: files }),
  ...Object.fromEntries(Object.entries(files).map(([file, text]) => [`plugins/${id}/package/${file}`, text])),
});
const leftOut = (...ids: string[]) => new RegExp(`aren't valid installed plugins.*${ids.map(id => `'${id}'`).join(", ")}`);

// t3 (RED: stray.txt and memory/notes shipped): only the manifest and its integrity files are the package.
test("a valid plugin ships only its manifest and integrity files, never data/, memory or strays", async t => {
  const { sources, installDir } = site(t);
  installSitePlugin({ installDir, id: "good", version: "1.0.0", package: PACKAGE }, { extra: RUNTIME });
  const { entries, note } = await exported(sources);
  assert.deepEqual(entries, shipped("good", "1.0.0"));
  assert.equal(note, undefined);
});

// t5: retained versions stay behind; the activation pin, else the latest, is the one that ships.
test("two retained versions export only the latest, or the pinned one", async t => {
  for (const [pins, version] of [[{}, "1.1.0"], [{ multi: "1.0.0" }, "1.0.0"]] as const) {
    const { sources, installDir } = site(t, { pins });
    for (const v of ["1.0.0", "1.1.0"]) installSitePlugin({ installDir, id: "multi", version: v, package: { ...PACKAGE, "server/index.mjs": v } });
    const { entries, plugins } = await exported(sources);
    assert.deepEqual(entries, shipped("multi", version, { ...PACKAGE, "server/index.mjs": version }), version);
    // The archive's plugin record names the shipped version, read from the manifest Jini listed.
    assert.deepEqual(plugins.map(plugin => [plugin.kind, plugin.id, plugin.version]), [["site", "multi", version]]);
  }
});

// t1 (Codex HIGH, RED: with no matching manifest the slot was walked flat, so 1.0.0/data/ and
// 1.0.0/memory/private/ shipped as package content): a missing or corrupt manifest ships nothing.
test("a plugin whose only version has a missing or corrupt manifest ships nothing, and the note names it", async t => {
  const { sources, installDir, write } = site(t);
  installSitePlugin({ installDir, id: "good", version: "1.0.0", package: PACKAGE });
  write(Object.fromEntries(Object.entries({ ...PACKAGE, ...RUNTIME }).flatMap(([file, text]) => [[`missing/1.0.0/${file}`, text], [`corrupt/1.0.0/${file}`, text]])));
  write({ "corrupt/1.0.0/jini.plugin.json": "{" });
  const { entries, note } = await exported(sources);
  assert.deepEqual(entries, shipped("good", "1.0.0"));
  assert.match(note ?? "", leftOut("corrupt", "missing"));
});

// t2 (RED: a pin to a version that is not installed fell back to another version): nothing ships.
test("a pin to a version that is not installed ships nothing rather than another version", async t => {
  const { sources, installDir } = site(t, { pins: { multi: "2.0.0" } });
  for (const v of ["1.0.0", "1.1.0"]) installSitePlugin({ installDir, id: "multi", version: v, package: PACKAGE });
  const { entries, note } = await exported(sources);
  assert.deepEqual(entries, {});
  assert.match(note ?? "", leftOut("multi"));
});

// t4 (RED: a file changed after install shipped): an integrity mismatch keeps the whole plugin out.
test("a package file that no longer matches its integrity hash keeps the whole plugin out", async t => {
  const { sources, installDir } = site(t);
  const root = installSitePlugin({ installDir, id: "tampered", version: "1.0.0", package: PACKAGE });
  writeFileSync(path.join(root, "src/data/default.json"), "changed");
  const { entries, note } = await exported(sources);
  assert.deepEqual(entries, {});
  assert.match(note ?? "", leftOut("tampered"));
});

// Mutation-proven (dropping the listed-vs-walked count check ships a partial package): a listed file the
// walk does not add (deleted after install, or a symlink) keeps the whole plugin out.
test("a package file deleted or replaced by a symlink after install keeps the whole plugin out", { skip: process.platform === "win32" }, async t => {
  const { sources, installDir } = site(t);
  rmSync(path.join(installSitePlugin({ installDir, id: "deleted", version: "1.0.0", package: PACKAGE }), "src/data/default.json"));
  const linked = path.join(installSitePlugin({ installDir, id: "linked", version: "1.0.0", package: PACKAGE }), "src/data/default.json");
  rmSync(linked);
  symlinkSync(path.join(installDir, "deleted/1.0.0/server/index.mjs"), linked);
  const { entries, note } = await exported(sources);
  assert.deepEqual(entries, {});
  assert.match(note ?? "", leftOut("deleted", "linked"));
});

// RED: flat and tier folders were walked as packages. They are not a Jini layout, so nothing ships.
test("flat and tier folders are not installed plugins: nothing ships and the note names them", async t => {
  const { sources, write } = site(t);
  write({ "flat/index.js": "root", "flat/1.2.3/help.js": "help", "static/demo/index.js": "tier", ".drafts/x/1.0.0/index.js": "staging" });
  const { entries, note } = await exported(sources);
  assert.deepEqual(entries, {});
  assert.match(note ?? "", leftOut("flat", "static"));
  assert.doesNotMatch(note ?? "", /drafts/);
});

// RED: a FIFO planted as the manifest hung the export forever on its read.
test("a FIFO where a manifest goes neither hangs the export nor ships the plugin", { skip: process.platform === "win32" }, async t => {
  const { sources, installDir, write } = site(t);
  write({ "fifo/1.0.0/server/index.mjs": "export default {};" });
  const fifo = path.join(installDir, "fifo/1.0.0/jini.plugin.json");
  execFileSync("mkfifo", [fifo]);
  const outcome = await Promise.race([exported(sources), new Promise<"hung">(resolve => setTimeout(() => resolve("hung"), 3000))]);
  // A blocked reader holds a libuv thread; one writer releases it so the test process can exit.
  if (outcome === "hung") await writeFile(fifo, "{}");
  assert.notEqual(outcome, "hung");
  assert.deepEqual((outcome as Awaited<ReturnType<typeof exported>>).entries, {});
});

// RED (P1 check, batch7): the ZIP reread a package file by size and mtime only, so a same-size file
// swapped in with its mtime restored after the hash check shipped. The ZIP must carry the checked bytes.
for (const file of ["src/data/default.json", "jini.plugin.json"]) {
  test(`a same-size, same-mtime swap of ${file} after the check refuses the export instead of shipping it`, async t => {
    const { sources, installDir } = site(t);
    const target = path.join(installSitePlugin({ installDir, id: "swapped", version: "1.0.0", package: PACKAGE }), file);
    utimesSync(target, 1_700_000_000, 1_700_000_000); // whole seconds, so restoring the mtime is exact
    const before = statSync(target);
    const swap = () => {
      writeFileSync(target, "x".repeat(before.size));
      utimesSync(target, 1_700_000_000, 1_700_000_000);
      const after = statSync(target);
      assert.deepEqual([after.size, after.mtimeMs], [before.size, before.mtimeMs], "the swap is invisible to size and mtime");
    };
    await assert.rejects(exported(sources, { beforeEncode: swap }), { code: "PLAN_STALE" });
  });
}

// RED (P1 check, batch7): only the last path component was guarded, so a package folder replaced by a
// symlink to a copy with matching bytes still shipped. A listed file reached through a link ships nothing.
// Before collection the plugin is left out; after it (the plan is fixed) the export is refused. The
// outside copy has the same bytes, size and mtime, so only the linked-folder check can tell.
const linkSrcFolder = (root: string, outside: string) => {
  utimesSync(path.join(root, "src/data/default.json"), 1_700_000_000, 1_700_000_000);
  return () => {
    mkdirSync(path.join(outside, "data"), { recursive: true });
    writeFileSync(path.join(outside, "data/default.json"), PACKAGE["src/data/default.json"]);
    utimesSync(path.join(outside, "data/default.json"), 1_700_000_000, 1_700_000_000);
    rmSync(path.join(root, "src"), { recursive: true });
    symlinkSync(outside, path.join(root, "src"));
  };
};
test("a package folder replaced by a symlink keeps the plugin out, even when the bytes match", { skip: process.platform === "win32" }, async t => {
  const { sources, installDir } = site(t);
  linkSrcFolder(installSitePlugin({ installDir, id: "linkeddir", version: "1.0.0", package: PACKAGE }), path.join(path.dirname(installDir), "outside"))();
  const { entries, note } = await exported(sources);
  assert.deepEqual(entries, {});
  assert.match(note ?? "", leftOut("linkeddir"));
});
test("a package folder replaced by a symlink after the check refuses the export, even when the bytes match", { skip: process.platform === "win32" }, async t => {
  const { sources, installDir } = site(t);
  const swap = linkSrcFolder(installSitePlugin({ installDir, id: "linkeddir", version: "1.0.0", package: PACKAGE }), path.join(path.dirname(installDir), "outside"));
  await assert.rejects(exported(sources, { beforeEncode: swap }), { code: "PLAN_STALE" });
});
