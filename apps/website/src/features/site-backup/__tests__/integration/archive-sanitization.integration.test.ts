/** Approved k1 Job 1 / trims T3–T4: real projection, ZIP and isolated import worker. */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { openContentDb } from "../../../../platform/db/sqlite/content-db.js";
import { closeSqliteConnection } from "../../../../platform/db/kernel/drivers/sqlite.js";
import { sanitizeShareDatabase, rebuildImportDatabase } from "../../../../server/runtime/composition/site-portability.js";
import { runtimeSchemaVersion } from "../../../../platform/site-dir/schema-guard.js";
import { buildShareZip } from "../../share-zip.js";
import { verifySiteImport } from "../../import-verifier.js";
import { createShareArchiveReader } from "../../import-archive-reader.js";
import type { SiteSharePlanContent } from "../../plan-store.js";
import * as yauzl from "yauzl";
import Database from "better-sqlite3";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareShareContent } from "../../share-preparation.js";
import { rewriteArchiveMedia } from "../../../../server/runtime/composition/site-portability.js";
import { resolveAgentPluginLayout } from "../../../agent-plugins/layout.js";
import { buildArchiveManifest } from "../../archive-manifest.js";

const stamp = "2026-10-31T00:00:00Z";
const bearer = "Authorization: Bearer " + "exampleCredentialValue987654321";
const reader = createShareArchiveReader({ yauzl });
function source() {
  const db = openContentDb({ filePath: ":memory:" });
  db.$client.prepare("INSERT INTO workspaces(id,slug,name,created_at) VALUES ('ws','site','Site',?)").run(stamp);
  db.$client.prepare("INSERT INTO posts(id,workspace_id,title,slug,body_json,status,kind,updated_at,version) VALUES ('post','ws','Title','post',?,'draft','post',?,1)").run(JSON.stringify({ text: bearer }), stamp);
  return db;
}
function plan(bytes: Buffer): SiteSharePlanContent {
  return { target: { kind: "zip" }, profile: "share", database: { bytes, watermarkAtCapture: 0 }, files: [],
    bufferedFiles: [{ path: "settings.json", content: Buffer.from('{"name":"Site"}') }],
    include: { database: true, media: true, themes: true, plugins: true, settings: true }, skipped: [], scopeNotes: {},
    totalBytes: bytes.length, site: { name: "Site", folderName: "site" }, schema: runtimeSchemaVersion(), tovuVersion: "test", createdAt: stamp };
}
test("safe source baseline uses real trusted projection", { timeout: 120000 }, async t => {
  const db = source(); t.after(() => closeSqliteConnection(db));
  db.$client.prepare("UPDATE posts SET body_json='{}'").run();
  const safe = await sanitizeShareDatabase({ snapshot: db.$client.serialize() });
  assert.ok(safe.bytes.length);
});
test("Bearer post is blanked before SQLite insertion and FTS, with a safe location notice", { timeout: 120000 }, async t => {
  const db = source(); t.after(() => closeSqliteConnection(db));
  const safe = await sanitizeShareDatabase({ snapshot: db.$client.serialize() });
  assert.equal(safe.bytes.includes(Buffer.from("exampleCredentialValue987654321")), false);
  assert.match(safe.notices!.join("\n"), /posts\.body_json.*post/);
  assert.equal(safe.notices!.join("\n").includes("exampleCredential"), false);
  const archive = await buildShareZip({ plan: { ...plan(safe.bytes), notices: safe.notices }, zip: zipFolderFiles });
  const imported = await verifySiteImport({ archive, reader, sanitize: rebuildImportDatabase, schema: runtimeSchemaVersion() });
  assert.equal(imported.database.includes(Buffer.from("exampleCredentialValue987654321")), false);
  assert.equal(db.$client.prepare<[], { body_json: string }>("SELECT body_json FROM posts").get()!.body_json, JSON.stringify({ text: bearer }), "source is untouched");
});
test("correctly checksummed imported Bearer post is sanitized by the real worker", { timeout: 120000 }, async t => {
  const db = source(); t.after(() => closeSqliteConnection(db));
  // Use trusted schema bytes but bypass the export projection to exercise hostile import input.
  const archive = await buildShareZip({ plan: plan(db.$client.serialize()), zip: zipFolderFiles });
  const imported = await verifySiteImport({ archive, reader, sanitize: rebuildImportDatabase, schema: runtimeSchemaVersion() });
  assert.equal(imported.database.includes(Buffer.from("exampleCredentialValue987654321")), false);
  assert.match(imported.warnings.join("\n"), /posts\.body_json.*post/);
});
test("suspicious files are omitted, and edited bundled labels survive by plugin id", { timeout: 120000 }, async t => {
  const db = source(); t.after(() => closeSqliteConnection(db));
  db.$client.prepare("UPDATE posts SET body_json='{}'").run();
  const safe = await sanitizeShareDatabase({ snapshot: db.$client.serialize() });
  const labels = Buffer.from('{"API token":"Token de API","edited":true}');
  const key = "ghp_" + "a1".repeat(18);
  const notices: string[] = [];
  const plugin = { kind: "agent" as const, id: "core", version: "1", digest: "a".repeat(64), enabled: true, shipped: true };
  const archive = await buildShareZip({ plan: { ...plan(safe.bytes), plugins: [plugin], bufferedFiles: [
    ...plan(safe.bytes).bufferedFiles!, { path: "agent-plugins/core/package/plugin.json", content: labels },
    { path: "themes/site/private-key.pem", content: Buffer.from(key) }, { path: "themes/site/main.js", content: Buffer.from(key) },
  ] }, zip: zipFolderFiles }, { notices, bundledImportPluginIds: new Set(["core"]) });
  const files = new Map<string, Buffer>();
  for await (const e of reader.entries({ archive })) if (e.kind === "file") {
    const chunks: Buffer[] = []; for await (const c of e.openReadStream({})) chunks.push(Buffer.from(c));
    files.set(e.entryPath, Buffer.concat(chunks));
  }
  assert.deepEqual(files.get("agent-plugins/core/package/plugin.json"), labels);
  assert.equal(files.has("themes/site/private-key.pem"), false);
  assert.equal(files.has("themes/site/main.js"), false);
  assert.ok(notices.length >= 2); assert.equal(notices.join().includes(key), false);
  const manifest = JSON.parse(files.get("manifest.json")!.toString());
  for (const f of manifest.files) assert.equal(f.sha256, createHash("sha256").update(files.get(f.path)!).digest("hex"));
  const imported = await verifySiteImport({ archive, reader, sanitize: rebuildImportDatabase, schema: runtimeSchemaVersion() }, { bundledImportPluginIds: new Set(["core"]) });
  assert.ok([...imported.files.values()].some(b => b.equals(labels)));
});

test("import omits a suspicious media file and prunes its database references without a missing-file refusal", { timeout: 120000 }, async t => {
  const db = source(); t.after(() => closeSqliteConnection(db));
  db.$client.prepare("UPDATE posts SET body_json='{}', featured_media_id='image'").run();
  const content = Buffer.from("Authorization: Bearer " + "mediaCredential987654321");
  const sha256 = createHash("sha256").update(content).digest("hex");
  const key = "ws/ws/blobs/" + sha256.slice(0, 2) + "/" + sha256;
  db.$client.prepare("INSERT INTO asset_blobs(id,workspace_id,sha256,storage_key,created_by_principal,created_at,status) VALUES ('blob','ws',?,?,'source',?,'active')").run(sha256, key, stamp);
  db.$client.prepare("INSERT INTO media(id,workspace_id,title,alt,caption,credit,source_sha256,status,created_at,updated_at,version) VALUES ('image','ws','Image','','','',?,'active',?,?,1)").run(sha256, stamp, stamp);
  const files = new Map([["content.db", db.$client.serialize()], ["settings.json", Buffer.from("{}")], ["media/image.bin", content]]);
  const manifest = buildArchiveManifest({ schema: runtimeSchemaVersion(), site: { name: "Site" }, scopes: plan(Buffer.alloc(0)).include, plugins: [],
    media: [{ id: "image", slug: "image", path: "media/image.bin", sha256 }],
    files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })) });
  files.set("manifest.json", Buffer.from(manifest));
  const picked = [...files].map(([name, bytes]) => {
    const f = new File([bytes as BlobPart], name.split("/").at(-1)!); Object.defineProperty(f, "webkitRelativePath", { value: "share/" + name }); return f;
  });
  const archive = Buffer.from(await (await zipFolderFiles({ files: picked, maxBytes: 300 * 1024 * 1024 })).arrayBuffer());
  const imported = await verifySiteImport({ archive, reader, sanitize: rebuildImportDatabase, schema: runtimeSchemaVersion() });
  assert.match(imported.warnings.join(), /media\/image.bin/);
  assert.equal(imported.files.has("uploads/" + key), false);
  const fresh = new Database(imported.database); t.after(() => fresh.close());
  assert.equal(fresh.prepare<[], { n: number }>("SELECT count(*) as n FROM media").get()!.n, 0);
  assert.equal(fresh.prepare<[], { featured_media_id: string | null }>("SELECT featured_media_id FROM posts").get()!.featured_media_id, null);
});

test("production preparation omits suspicious media through the projection owner", { timeout: 120000 }, async t => {
  const db = source(); t.after(() => closeSqliteConnection(db));
  db.$client.prepare("UPDATE posts SET body_json='{}', featured_media_id='image'").run();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "archive-media-omission-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const content = Buffer.from("Authorization: Bearer " + "mediaCredential987654321");
  const hash = createHash("sha256").update(content).digest("hex"), key = `ws/ws/blobs/${hash.slice(0, 2)}/${hash}`;
  await fs.writeFile(path.join(root, "blob"), content);
  db.$client.prepare("INSERT INTO asset_blobs(id,workspace_id,sha256,storage_key,created_by_principal,created_at,status) VALUES ('blob','ws',?,?,'source',?,'active')").run(hash, key, stamp);
  db.$client.prepare("INSERT INTO media(id,workspace_id,title,alt,caption,credit,source_sha256,status,created_at,updated_at,version) VALUES ('image','ws','Image','','','',?,'active',?,?,1)").run(hash, stamp, stamp);
  const prepared = await prepareShareContent({ snapshotRoot: root,
    sources: { siteDir: root, themesDir: path.join(root, "themes"), skillsDir: path.join(root, "skills"), mediaUploadsDir: null, agentPlugins: resolveAgentPluginLayout({ siteDir: root }, { env: {} }), tovuVersion: "test" },
    sanitize: sanitizeShareDatabase, rewriteMedia: rewriteArchiveMedia, imageTransformer: { transform: async () => assert.fail("not raster") },
    blobStore: { get: async () => fs.readFile(path.join(root, "blob")), sizeOf: async () => (await fs.stat(path.join(root, "blob"))).size },
    dbOps: { getCapabilities: async () => ({ restorePoint: { kind: "file-snapshot", costClass: "cheap" } }), captureRestorePoint: async () => {
      const artifactRef = path.join(root, "snapshot.db"); await fs.writeFile(artifactRef, db.$client.serialize()); return { artifactRef, watermarkAtCapture: 1 };
    }, restoreFromArtifact: async () => assert.fail("source is never restored") },
  });
  assert.deepEqual(prepared.media, []); assert.match(prepared.notices!.join(), /media\/image.bin/);
  const archive = await buildShareZip({ plan: prepared, zip: zipFolderFiles });
  await verifySiteImport({ archive, reader, sanitize: rebuildImportDatabase, schema: runtimeSchemaVersion() });
});

test("two suspicious unique slugs cannot turn sanitization into a constraint refusal", { timeout: 120000 }, async t => {
  const db = source(); t.after(() => closeSqliteConnection(db));
  db.$client.prepare("UPDATE posts SET body_json='{}', slug=?").run("ghp_" + "a".repeat(36));
  db.$client.prepare("INSERT INTO posts(id,workspace_id,title,slug,body_json,status,kind,updated_at,version) VALUES ('second','ws','Second',?,'{}','draft','post',?,1)").run("ghp_" + "b".repeat(36), stamp);
  const safe = await sanitizeShareDatabase({ snapshot: db.$client.serialize() });
  assert.equal(safe.bytes.includes(Buffer.from("ghp_")), false);
  assert.match(safe.notices!.join(), /posts\.slug.*post/);
  assert.match(safe.notices!.join(), /posts\.slug.*second/);
  const imported = await verifySiteImport({ archive: await buildShareZip({ plan: plan(safe.bytes), zip: zipFolderFiles }), reader, sanitize: rebuildImportDatabase, schema: runtimeSchemaVersion() });
  assert.ok(imported.database.length);
});

test("omitting an invalidated menu also prunes only its own portable bindings", { timeout: 120000 }, async t => {
  const db = source(); t.after(() => closeSqliteConnection(db));
  db.$client.prepare("UPDATE posts SET body_json='{}'").run();
  const menu = db.$client.prepare("INSERT INTO menus(id,workspace_id,slug,title,status,doc_json,locations_json,updated_at,version) VALUES (?,'ws',?,'Menu','active','{\"items\":[]}','[]',?,1)");
  menu.run("bad-menu", "ghp_" + "c".repeat(36), stamp); menu.run("good-menu", "good", stamp);
  const binding = db.$client.prepare("INSERT INTO nav_location_bindings(workspace_id,location_key,menu_id,bound_at) VALUES ('ws',?,?,?)");
  binding.run("header", "bad-menu", stamp); binding.run("footer", "good-menu", stamp);
  const projected = await sanitizeShareDatabase({ snapshot: db.$client.serialize() });
  const fresh = new Database(projected.bytes); t.after(() => fresh.close());
  assert.deepEqual(fresh.prepare("SELECT id FROM menus").all(), [{ id: "good-menu" }]);
  assert.deepEqual(fresh.prepare("SELECT menu_id FROM nav_location_bindings").all(), [{ menu_id: "good-menu" }]);
  assert.match(projected.notices!.join(), /menus\.slug.*bad-menu/);
  await verifySiteImport({ archive: await buildShareZip({ plan: plan(projected.bytes), zip: zipFolderFiles }), reader, sanitize: rebuildImportDatabase, schema: runtimeSchemaVersion() });
});
