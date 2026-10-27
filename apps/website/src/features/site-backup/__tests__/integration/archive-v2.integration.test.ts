import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import * as yauzl from "yauzl";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { sanitizeShareDatabase, rewriteArchiveMedia } from "#src/platform/db/sqlite/share-database";
import { runtimeSchemaVersion } from "#src/platform/site-dir/index";
import { readTemplate } from "#src/platform/site-dir/read-template";
import { computeBlobStorageKey, SharpImageTransformer } from "#src/features/media/index";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { loadTheme } from "#src/features/theme/theme";
import { resetThemeFileToOriginal } from "#src/features/theme/theme-files";
import { prepareShareContent } from "../../share-preparation.js";
import { bufferArchiveMedia } from "../../archive-media.js";
import { buildShareZip } from "../../share-zip.js";
import { verifySiteImport } from "../../import-verifier.js";
import { createShareArchiveReader } from "../../import-archive-reader.js";
import { readBundledPackageFiles } from "../../package-file-inventory.js";
import { stageVerifiedImport, restoreStagedImport, stagedImportWarnings } from "../../import-restore.js";
import { jiniSitePlugins, sitePluginManifest } from "../fixtures/site-plugin.fixture.js";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const stamp = "2026-10-26T00:00:00Z";
const reader = createShareArchiveReader({ yauzl });
const privateSentinel = "SOURCE_PRIVATE_DATA_15b637";

function write(root: string, file: string, bytes: string | Buffer): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), bytes);
}
async function unpack(archive: Buffer): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for await (const entry of reader.entries({ archive })) {
    if (entry.kind !== "file") continue;
    const chunks: Buffer[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
    files.set(entry.entryPath, Buffer.concat(chunks));
  }
  return files;
}
async function repack(files: ReadonlyMap<string, Buffer>): Promise<Buffer> {
  const picked = [...files].map(([name, bytes]) => {
    const file = new File([bytes as BlobPart], name.split("/").at(-1)!);
    Object.defineProperty(file, "webkitRelativePath", { value: "pick/" + name });
    return file;
  });
  return Buffer.from(await (await zipFolderFiles({ files: picked, maxBytes: 300 * 1024 * 1024 })).arrayBuffer());
}
async function fixture(t: TestContext, optional: { siteFiles?: Readonly<Record<string, string>>; activeThemeId?: string } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-v2-"));
  t.after(() => {
    // Installed plugin packages are read-only; make the tree writable so it can be removed.
    for (const entry of fs.readdirSync(root, { recursive: true }) as string[]) fs.chmodSync(path.join(root, entry), 0o700);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const siteDir = path.join(root, "source"), sourceRoot = path.join(root, "bundled");
  const sharp = (await import("sharp")).default;
  const pixels = { create: { width: 2, height: 2, channels: 3 as const, background: "red" } };
  const webp = await sharp(pixels).webp().toBuffer();
  const png = await sharp(pixels).png().toBuffer(), jpeg = await sharp(pixels).jpeg().toBuffer();
  const db = openContentDb({ filePath: ":memory:" });
  t.after(() => db.$client.close());
  db.$client.prepare("INSERT INTO workspaces (id,slug,name,created_at) VALUES ('ws','source','Source',?)").run(stamp);
  db.$client.prepare("INSERT INTO posts (id,workspace_id,title,slug,body_json,status,kind,updated_at,version) VALUES ('page','ws','Page','page','{\"type\":\"doc\",\"content\":[]}','draft','page',?,1)").run(stamp);
  db.$client.prepare("INSERT INTO presentation_settings (workspace_id,active_theme_id,updated_at) VALUES ('ws',?,?)").run(optional.activeThemeId ?? "static/site", stamp);
  db.$client.prepare("INSERT INTO principals (id,workspace_id,kind,display_name,status,created_at) VALUES ('owner','ws','user','Owner','active',?)").run(stamp);
  db.$client.prepare("INSERT INTO identity_users (principal_id,workspace_id,username,password_hash) VALUES ('owner','ws','admin',?)").run(privateSentinel);
  db.$client.prepare("INSERT INTO sessions (id,workspace_id,principal_id,token_hash,created_at,expires_at) VALUES ('session','ws','owner',?,?,?)").run(privateSentinel, stamp, stamp);
  const blobs = new Map<string, Buffer>();
  const add = (id: string, slug: string, bytes: Buffer, kind = "media", filename: string | null = null) => {
    const hash = sha(bytes), key = computeBlobStorageKey({ workspaceId: "ws", sha256: hash });
    blobs.set(key, bytes);
    db.$client.prepare("INSERT OR IGNORE INTO asset_blobs (id,workspace_id,sha256,storage_key,created_by_principal,created_at,status,document_owned) VALUES (?,'ws',?,?,'owner',?,'active',?)").run(hash, hash, key, stamp, kind === "document" ? 1 : 0);
    db.$client.prepare("INSERT INTO media (id,workspace_id,slug,title,kind,original_filename,alt,caption,credit,source_sha256,status,created_at,updated_at,version) VALUES (?,'ws',?,?,?,?, '','','',?,'active',?,?,1)").run(id, slug, id, kind, filename, hash, stamp, stamp);
    return key;
  };
  add("a", "Photo", png);
  add("b", "PHOTO", jpeg);
  add("s", "icon", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0"/></svg>'));
  add("d", "manual", Buffer.from("# Library document\n"), "document", "manual.md");
  db.$client.prepare("INSERT INTO transform_registry (id,workspace_id,name,version,params_json,owner,created_at) VALUES ('public','ws','public',1,?,'core',?)").run('{"format":"webp"}', stamp);
  write(siteDir, "themes/static/site/theme.json", '{"id":"site","name":"Site","version":"1.0.0","tier":"static"}');
  write(siteDir, "themes/static/site/index.html", "<main>edited theme</main>");
  write(siteDir, "themes/static/site/tokens.json", "{}");
  write(siteDir, "themes/static/site/pages/index.html", '<!doctype html><html><head><link rel="stylesheet" href="../css/styles.css" /></head><body>Site</body></html>');
  write(siteDir, "themes/static/site/css/styles.css", "body{margin:0}");
  write(siteDir, "themes/__original-themes__/static/site/theme.json", '{"id":"site","name":"Site","version":"1.0.0","tier":"static"}');
  write(siteDir, "themes/__original-themes__/static/site/index.html", "<main>original theme</main>");
  write(siteDir, "themes/__original-themes__/static/site/tokens.json", "{}");
  write(siteDir, "themes/__original-themes__/static/site/pages/index.html", '<!doctype html><html><head><link rel="stylesheet" href="../css/styles.css" /></head><body>Original</body></html>');
  write(siteDir, "themes/__original-themes__/static/site/css/styles.css", "body{margin:0}");
  write(siteDir, "skills/ws/ws/notes/SKILL.md", "Site skill");
  for (const [file, text] of Object.entries(optional.siteFiles ?? {})) write(siteDir, file, text);
  write(siteDir, "config.json", JSON.stringify({ name: "Source", domain: "private.test", port: 9911, password: privateSentinel }));
  write(siteDir, ".site-meta.json", JSON.stringify({ templateId: "starter", siteId: privateSentinel }));
  write(sourceRoot, "demo/plugin.json", '{"$schema":"https://agent-plugins.org/schemas/1.1.0/plugin.schema.json","name":"demo","version":"1.0.0","description":"Fixture plugin"}');
  write(sourceRoot, "demo/skills/demo/SKILL.md", "Fixture skill");
  write(sourceRoot, "demo/server.mjs", "export const value = 1;");
  const layout = resolveAgentPluginLayout({ siteDir, env: {} });
  const lifecycle = createTovuAgentPluginLifecycle({ layout });
  await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: "ws", sourceRoot });
  await lifecycle.setAgentPluginActivation({ workspaceRoot: layout.forWorkspace("ws").root, pluginId: "demo", enabled: true, actor: "owner" });
  write(siteDir, "agent-plugins/ws/ws/demo/memory/notes/note.md", "Site note");
  const packageFiles = await readBundledPackageFiles({}, { sourceRoot });
  const sourceBefore = db.$client.serialize();
  const plan = await prepareShareContent({ snapshotRoot: root, sources: { siteDir, themesDir: path.join(siteDir, "themes"), skillsDir: path.join(siteDir, "skills"), mediaUploadsDir: null, agentPlugins: layout, sitePlugins: jiniSitePlugins({ installDir: path.join(siteDir, "plugins") }), tovuVersion: "test" }, sanitize: sanitizeShareDatabase, rewriteMedia: rewriteArchiveMedia,
    imageTransformer: { transform: async () => ({ bytes: webp, contentType: "image/webp" }) },
    blobStore: { sizeOf: async ({ storageKey }) => blobs.get(storageKey)?.length ?? null, get: async ({ storageKey }) => blobs.get(storageKey)! },
    dbOps: { getCapabilities: async () => ({ restorePoint: { kind: "file-snapshot", costClass: "cheap" } }), captureRestorePoint: async () => { const artifactRef = path.join(root, "snapshot.db"); fs.writeFileSync(artifactRef, sourceBefore); return { artifactRef, watermarkAtCapture: 5 }; }, restoreFromArtifact: async () => assert.fail("no live restore") },
  });
  assert.deepEqual(db.$client.serialize(), sourceBefore);
  assert.equal(fs.existsSync(path.join(root, "snapshot.db")), false);
  const archive = await buildShareZip({ plan, zip: zipFolderFiles }, { packageFiles });
  const verify = (archive: Buffer) => verifySiteImport({ archive, reader, sanitize: sanitizeShareDatabase, schema: runtimeSchemaVersion() }, { packageFiles });
  const restore = async (archive: Buffer, name: string) => {
    const verified = await verify(archive);
    const stage = path.join(root, name + "-stage"), dir = path.join(root, name);
    fs.mkdirSync(dir);
    stageVerifiedImport({ root: stage, verified });
    await restoreStagedImport({ root: stage, dir, dbPath: path.join(dir, "content.db") }, { pluginSourceRoot: sourceRoot });
    return { verified, dir };
  };
  return { root, plan, archive, verify, restore, packageFiles, db, webp };
}

test("v2 tree, one public media copy per item, no secrets and full content round-trip", async t => {
  const h = await fixture(t), files = await unpack(h.archive);
  assert.ok(files.has("manifest.json") && files.has("content.db") && files.has("settings.json"));
  assert.equal([...files.keys()].some(path => /^(uploads|database|settings)\//.test(path)), false);
  assert.deepEqual([...files.keys()].filter(path => path.startsWith("media/")).sort(), ["media/PHOTO-2.webp", "media/Photo.webp", "media/icon.svg", "media/manual.md"]);
  assert.deepEqual(files.get("media/Photo.webp"), h.webp);
  assert.doesNotMatch(files.get("media/icon.svg")!.toString(), /script|alert/);
  assert.ok(files.has("themes/site/index.html") && files.has("themes/__originals__/site/index.html"));
  assert.ok(files.has("agent-plugins/demo/package/server.mjs"));
  assert.ok(files.has("agent-plugins/demo/memory/notes/note.md"));
  assert.ok(files.has("skills/notes/SKILL.md"));
  assert.equal([...files.keys()].some(path => path.includes("/ws/")), false);
  assert.equal([...files.keys()].some(path => /activations.json|bundled-digests.json/.test(path)), false);
  for (const bytes of files.values()) assert.equal(bytes.includes(Buffer.from(privateSentinel)), false);
  assert.deepEqual(JSON.parse(files.get("settings.json")!.toString()), { name: "Source", template: { templateId: "starter" } });
  const { dir, verified } = await h.restore(h.archive, "copy");
  const restored = new Database(verified.database);
  try {
    assert.deepEqual(restored.prepare("SELECT id,title,status,body_json FROM posts").all(), h.db.$client.prepare("SELECT id,title,status,body_json FROM posts").all());
    assert.equal((restored.prepare("SELECT count(*) n FROM media").get() as { n: number }).n, 4);
    assert.equal((restored.prepare("SELECT count(*) n FROM identity_users").get() as { n: number }).n, 0);
    const renditions = restored.prepare("SELECT asset_id,transform_name,storage_key FROM asset_renditions").all() as { asset_id: string; transform_name: string; storage_key: string }[];
    assert.equal(renditions.length, 6);
    for (const row of renditions) assert.ok(fs.existsSync(path.join(dir, "uploads", row.storage_key)));
    assert.equal(renditions.find(row => row.asset_id === "a" && row.transform_name === "original")!.storage_key, renditions.find(row => row.asset_id === "a" && row.transform_name === "public")!.storage_key);
  } finally { restored.close(); }
  assert.equal(fs.readFileSync(path.join(dir, "themes/__original-themes__/static/site/index.html"), "utf8"), "<main>original theme</main>");
  const themesRoot = path.join(dir, "themes");
  assert.equal(loadTheme({ themeDir: path.join(themesRoot, "static/site"), id: "site", source: "site" }).status, "valid");
  assert.equal(resetThemeFileToOriginal({ themeDir: path.join(themesRoot, "static/site"), themesRoot, originalDir: path.join(themesRoot, "__original-themes__/static/site"), originalsRoot: path.join(themesRoot, "__original-themes__"), relativePath: "index.html" })?.wasModified, true);
  assert.equal(fs.readFileSync(path.join(themesRoot, "static/site/index.html"), "utf8"), "<main>original theme</main>");
  assert.ok(fs.existsSync(path.join(dir, ".import-quarantine/agent-plugins/demo/package/server.mjs")));
  const layout = resolveAgentPluginLayout({ siteDir: dir, env: {} }), lifecycle = createTovuAgentPluginLifecycle({ layout });
  const workspaceRoot = layout.forWorkspace(readTemplate({ templateId: "starter" }).seed.workspace.id).root;
  assert.equal((await lifecycle.readAgentPluginActivations({ workspaceRoot })).plugins.demo!.enabled, true);
});

// RED (Codex check 2026-10-26): a theme with id `overrides` exported into the overrides namespace, so
// import quarantined it and fell back to the starter theme.
test("a theme named overrides and the site's theme overrides both round-trip without colliding", async t => {
  const theme = '{"id":"overrides","name":"Overrides","version":"1.0.0","tier":"static"}';
  const h = await fixture(t, { activeThemeId: "static/overrides", siteFiles: {
    "themes/static/overrides/theme.json": theme,
    "themes/static/overrides/index.html": "<main>overrides theme</main>",
    "themes/static/overrides/tokens.json": "{}",
    "themes/static/overrides/pages/index.html": '<!doctype html><html><head><link rel="stylesheet" href="../css/styles.css" /></head><body>Overrides</body></html>',
    "themes/static/overrides/css/styles.css": "body{margin:0}",
    "overrides/custom.css": "body{color:red}",
  } });
  const files = await unpack(h.archive);
  assert.equal(files.get("themes/overrides/index.html")?.toString(), "<main>overrides theme</main>");
  assert.equal(files.get("themes/__overrides__/custom.css")?.toString(), "body{color:red}");
  const { dir } = await h.restore(h.archive, "overrides-copy");
  const themesRoot = path.join(dir, "themes");
  assert.equal(fs.readFileSync(path.join(themesRoot, "static/overrides/index.html"), "utf8"), "<main>overrides theme</main>");
  assert.equal(loadTheme({ themeDir: path.join(themesRoot, "static/overrides"), id: "overrides", source: "site" }).status, "valid");
  for (const quarantined of [".import-quarantine/themes/static/overrides", ".import-quarantine/themes/untrusted/overrides", ".import-quarantine/overrides/index.html"]) {
    assert.equal(fs.existsSync(path.join(dir, quarantined)), false, `the theme is not quarantined (${quarantined})`);
  }
  assert.equal(fs.readFileSync(path.join(dir, ".import-quarantine/overrides/custom.css"), "utf8"), "body{color:red}");
  const restored = new Database(path.join(dir, "content.db"), { readonly: true });
  try {
    assert.deepEqual(restored.prepare("SELECT active_theme_id FROM presentation_settings").all(), [{ active_theme_id: "static/overrides" }]);
  } finally { restored.close(); }
});

// Rewritten for backup ownership P1 (2026-10-27). Before: a flat `plugins/flat/` (bare plugin.json) shipped
// as a package with its memory/notes and a 2fa/ folder. Site plugins have no memory folders, and export
// now ships only the files Jini lists for a valid installed version (manifest plus integrity), so a flat
// folder, notes and runtime data stay home and the folder is named in the plugins note instead.
test("a site plugin ships only its installed package, which import keeps off outside Jini's install dir", async t => {
  const installed = { id: "versioned", version: "1.0.0", package: { "index.js": "export default {};" } };
  const h = await fixture(t, { siteFiles: {
    "plugins/flat/plugin.json": '{"id":"flat","name":"Flat","version":"1.0.0"}',
    "plugins/flat/memory/notes/n.md": "public note",
    "plugins/flat/2fa/data/help.md": "plugin docs",
    "plugins/versioned/1.0.0/jini.plugin.json": sitePluginManifest(installed),
    "plugins/versioned/1.0.0/index.js": installed.package["index.js"],
    "plugins/versioned/1.0.0/memory/notes/n.md": "public note",
    "plugins/versioned/1.0.0/memory/private/secret.md": "private memory",
  } });
  const files = await unpack(h.archive);
  assert.deepEqual([...files.keys()].filter(name => name.startsWith("plugins/")).sort(), ["plugins/versioned/package/index.js", "plugins/versioned/package/jini.plugin.json"]);
  assert.match(h.plan.scopeNotes.plugins ?? "", /'flat'/);
  const { dir } = await h.restore(h.archive, "plugin-copy");
  assert.equal(fs.readFileSync(path.join(dir, ".import-quarantine/plugins/versioned/package/index.js"), "utf8"), installed.package["index.js"]);
  const discovered = await jiniSitePlugins({ installDir: path.join(dir, "plugins") })();
  assert.deepEqual(discovered.records.filter(record => record.source === "site"), [], "imported site plugin code never enters Jini's discovery root");
});

test("one Finder wrapper and metadata import; two wrappers and files outside the wrapper refuse", async t => {
  const h = await fixture(t), files = await unpack(h.archive);
  const wrapped = new Map([...files].map(([name, bytes]) => ["Source/" + name, bytes]));
  wrapped.set("__MACOSX/._Source", Buffer.from("Finder")); wrapped.set("Source/.DS_Store", Buffer.from("Finder"));
  assert.equal((await h.verify(await repack(wrapped))).name, "Source");
  const noManifest = { code: "INVALID_ARCHIVE", message: /^A v2 manifest\.json at root, or inside one wrapper folder with nothing outside it/ };
  await assert.rejects(h.verify(await repack(new Map([...files].map(([name, bytes]) => ["Outer/Inner/" + name, bytes])))), noManifest);
  wrapped.set("outside.txt", Buffer.from("outside"));
  await assert.rejects(h.verify(await repack(wrapped)), noManifest);
});

test("edited plugin and theme import with a warning and the whole unit kept off", async t => {
  const h = await fixture(t), files = await unpack(h.archive);
  files.set("agent-plugins/demo/package/server.mjs", Buffer.from("export const changed = true;"));
  files.set("themes/site/index.html", Buffer.from("<main>re-zipped</main>"));
  const { dir, verified } = await h.restore(await repack(files), "edited");
  assert.equal(verified.warnings.length, 2);
  assert.equal(verified.trustedPlugins.length, 0);
  assert.equal(fs.existsSync(path.join(dir, "themes/static/site/index.html")), false);
  assert.ok(fs.existsSync(path.join(dir, ".import-quarantine/themes/static/site/index.html")));
  const layout = resolveAgentPluginLayout({ siteDir: dir, env: {} }), lifecycle = createTovuAgentPluginLifecycle({ layout });
  const workspaceRoot = layout.forWorkspace(readTemplate({ templateId: "starter" }).seed.workspace.id).root;
  assert.equal((await lifecycle.readAgentPluginActivations({ workspaceRoot })).plugins.demo!.enabled, false);
  // A later boot's seeder must preserve the importer's explicit disabled decision.
  await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: readTemplate({ templateId: "starter" }).seed.workspace.id, sourceRoot: path.join(h.root, "bundled") });
  assert.equal((await lifecycle.readAgentPluginActivations({ workspaceRoot })).plugins.demo!.enabled, false);
  for (const file of ["content.db", "media/Photo.webp"]) {
    const damaged = new Map(files); damaged.set(file, Buffer.from("damaged"));
    await assert.rejects(h.verify(await repack(damaged)));
  }
});

test("a built-in shipped by a different Tovu version keeps this install's own state; the imported copy stays off with a warning", async t => {
  const h = await fixture(t), bundled = path.join(h.root, "bundled-next");
  write(bundled, "demo/plugin.json", '{"$schema":"https://agent-plugins.org/schemas/1.1.0/plugin.schema.json","name":"demo","version":"1.1.0","description":"Fixture plugin"}');
  write(bundled, "demo/skills/demo/SKILL.md", "Fixture skill");
  write(bundled, "demo/server.mjs", "export const value = 2;");
  const verified = await verifySiteImport({ archive: h.archive, reader, sanitize: sanitizeShareDatabase, schema: runtimeSchemaVersion() }, { packageFiles: await readBundledPackageFiles({}, { sourceRoot: bundled }) });
  const stage = path.join(h.root, "skew-stage"), dir = path.join(h.root, "skew"), fresh = path.join(h.root, "fresh");
  fs.mkdirSync(dir);
  stageVerifiedImport({ root: stage, verified });
  await restoreStagedImport({ root: stage, dir, dbPath: path.join(dir, "content.db") }, { pluginSourceRoot: bundled });
  const workspaceId = readTemplate({ templateId: "starter" }).seed.workspace.id;
  const activation = async (siteDir: string) => {
    const layout = resolveAgentPluginLayout({ siteDir, env: {} }), lifecycle = createTovuAgentPluginLifecycle({ layout });
    if (siteDir === fresh) await lifecycle.seedBundledAgentPlugins({ layout, workspaceId, sourceRoot: bundled });
    const { updatedAt: _when, ...record } = (await lifecycle.readAgentPluginActivations({ workspaceRoot: layout.forWorkspace(workspaceId).root })).plugins.demo!;
    return record;
  };
  // Same record a fresh seed writes: not an import-written "switched off" decision the seeder would then preserve.
  assert.deepEqual(await activation(dir), await activation(fresh));
  assert.deepEqual(stagedImportWarnings({ root: stage }), [
    "Agent plugin 'demo' isn't code this Tovu recognises. It was imported and kept switched off.",
    "Skill 'notes' isn't code this Tovu recognises. It was imported and kept switched off.",
  ]);
});

test("the real public raster transformer strips GPS/EXIF before archive selection", async () => {
  const sharp = (await import("sharp")).default;
  const original = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).jpeg().withExif({ IFD0: { Artist: "Source identity" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 0/1 0/1" } }).toBuffer();
  assert.ok((await sharp(original).metadata()).exif);
  const ledger: { sizes: { path: string; bytes: number }[]; buffered: { path: string; content: Buffer }[] } = { sizes: [], buffered: [] };
  await bufferArchiveMedia({ sources: [{ id: "gps", slug: "gps", workspaceId: "ws", kind: "media", originalFilename: "gps.jpg", storageKey: "gps", sha256: sha(original), public: { version: 1, params: { format: "webp" } } }], blobStore: { sizeOf: async () => original.length, get: async () => original }, imageTransformer: new SharpImageTransformer(), ledger });
  assert.equal(ledger.buffered.length, 1);
  assert.equal((await sharp(ledger.buffered[0]!.content).metadata()).exif, undefined);
  assert.equal(ledger.buffered[0]!.content.includes(Buffer.from("Source identity")), false);
});
