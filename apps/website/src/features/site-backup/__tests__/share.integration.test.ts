import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import * as yauzl from "yauzl";
import { createYauzlAgentPluginArchiveReader, type YauzlPort } from "@jini-ai/agent-plugins/lifecycle/yauzl";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { prepareShareContent } from "../share-preparation.js";
import { createRuntimeShareDelivery } from "../share-hosting.js";
import { uploadPlannedContent, initialPushProgress } from "../push-engine.js";
import type { SourceControlProvider } from "../../source-control/provider-module.js";
import express from "express";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { sanitizeShareDatabase, rewriteArchiveMedia } from "#src/server/runtime/composition/site-portability";
import { buildShareZip } from "../share-zip.js";
import { SiteBackupPlanStore } from "../plan-store.js";
import { SiteShareRegistry } from "../share-registry.js";
import { createSiteShare, revokeSiteShare } from "../share-service.js";
import { registerPublicShareRoutes } from "#src/server/inbound/public-http/routes/site-share";
import { excludedSharePath } from "../share-file-policy.js";
import { SHARE_LIMITS } from "../share-policy.js";
import { installSitePlugin, jiniSitePlugins } from "./fixtures/site-plugin.fixture.js";

const sentinel = "PRIVATE_SENTINEL_MUST_NEVER_LEAVE_719e2cb3";
const stamp = "2026-10-18T12:00:00.000Z";

async function fixture(t: TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-share-test-"));
  const db = openContentDb({ filePath: ":memory:" });
  t.after(async () => { db.$client.close(); await rm(dir, { recursive: true, force: true }); });
  const sql = db.$client;
  sql.prepare("INSERT INTO workspaces (id,slug,name,created_at) VALUES (?,?,?,?)").run("ws", "site", "Site", stamp);
  for (const [index, status] of ["draft", "published", "published", "draft"].entries()) {
    sql.prepare("INSERT INTO posts (id,workspace_id,title,slug,body_json,status,kind,updated_at,autosave_json,publish_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(`p${index}`, "ws", status, `${status}-${index}`, '{"type":"doc"}', status, index % 2 ? "post" : "page", stamp, '{"title":"standing draft"}', index === 1 ? "2030-01-01T00:00:00.000Z" : null, 1);
  }
  sql.prepare("INSERT INTO principals (id,workspace_id,kind,display_name,status,created_at) VALUES ('owner','ws','user','Owner','active',?)").run(stamp);
  sql.prepare("INSERT INTO identity_users (principal_id,workspace_id,username,password_hash) VALUES ('owner','ws','owner',?)").run(sentinel);
  sql.prepare("INSERT INTO members (id,workspace_id,email,status,created_at,updated_at,version,password_hash) VALUES ('member','ws','member@example.test','active',?,?,1,?)").run(stamp, stamp, sentinel);
  sql.prepare("INSERT INTO sessions (id,workspace_id,principal_id,token_hash,created_at,expires_at) VALUES ('session','ws','owner',?,?,?)").run(sentinel, stamp, stamp);
  sql.prepare("INSERT INTO api_keys (id,workspace_id,principal_id,label,key_hash,prefix,created_at) VALUES ('key','ws','owner','test',?,'prefix',?)").run(sentinel, stamp);
  sql.prepare("INSERT INTO secrets_vault (workspace_id,id,kind,owner_key,label,is_default,revision,meta,created_at,updated_at) VALUES ('ws','vault','custom','tovu',?,0,1,'{}',?,?)").run(sentinel, stamp, stamp);
  // Legacy credentials and stranded chat have arbitrary old schemas: never copy their DDL.
  for (const name of ["_plugin_identity", "_plugin_migrations", "_plugin_migration_journal", "ai_chats", "ai_chat_messages", "assistant_agent_sessions", "assistant_conversation_tool_approvals", "assistant_run_attempts", "site_assistant_credentials", "admin_execution_credentials", "media_provider_credentials", "custom_credential_sets", "publish_content_peers", "database_transfer_destinations", "vendor_credential_sets", "source_control_credential_sets", "publish_credential_sets", "_vault_backup_custom"]) {
    sql.exec(`DROP TABLE IF EXISTS "${name}"`);
    sql.exec(`CREATE TABLE "${name}" (payload TEXT)`);
    sql.prepare(`INSERT INTO "${name}" VALUES (?)`).run(sentinel);
  }
  sql.exec("CREATE TABLE deleted_secret (payload TEXT)");
  sql.prepare("INSERT INTO deleted_secret VALUES (?)").run(sentinel);
  sql.exec("DROP TABLE deleted_secret");
  sql.prepare("INSERT INTO presentation_settings (workspace_id,active_theme_id,updated_at) VALUES ('ws','static/site',?)").run(stamp);
  sql.prepare("INSERT INTO menus (id,workspace_id,slug,title,status,doc_json,locations_json,updated_at,version) VALUES ('menu','ws','main','Main','active','{\"items\":[]}','[\"header\"]',?,1)").run(stamp);
  sql.prepare("INSERT INTO nav_location_bindings (workspace_id,location_key,menu_id,bound_at) VALUES ('ws','header','menu',?)").run(stamp);
  const mediaBytes = Buffer.from("OBJECT_STORAGE_MEDIA_BYTES");
  const hash = createHash("sha256").update(mediaBytes).digest("hex");
  const storageKey = `ws/ws/blobs/${hash.slice(0, 2)}/${hash}`;
  sql.prepare("INSERT INTO asset_blobs (id,workspace_id,sha256,storage_key,created_by_principal,created_at,status) VALUES ('blob','ws',?,?,'owner',?,'active')").run(hash, storageKey, stamp);
  sql.prepare("INSERT INTO media (id,workspace_id,title,alt,caption,credit,source_sha256,status,created_at,updated_at,version) VALUES ('media','ws','Photo','','','',?,'active',?,?,1)").run(hash, stamp, stamp);
  const definition = sql.prepare("INSERT INTO setting_definitions (setting_id,version,namespace,key,owner_kind,schema_json,default_json,scopes,secret,status,created_at,updated_at) VALUES (?,1,?,?,'core',?,?,2,?,'active',?,?)");
  definition.run("title", "core.site", "title", '{"type":"string"}', '"Default title"', 0, stamp, stamp);
  definition.run("description", "site.seo", "default_description", '{"type":"json"}', JSON.stringify({ token: "ghp_" + "x".repeat(36), text: "portable default" }), 0, stamp, stamp);
  definition.run("private-setting", "private", "credential", '{"type":"string"}', '"private default"', 0, stamp, stamp);
  definition.run("secret-setting", "core.site", "title", '{"type":"string"}', "null", 1, stamp, stamp);
  const setting = sql.prepare("INSERT INTO setting_values_workspace (setting_id,workspace_id,value_json,state,def_version,seq,updated_by,updated_at) VALUES (?,'ws',?,'set',1,1,'owner',?)");
  setting.run("title", '"Portable title"', stamp);
  setting.run("description", JSON.stringify({ password: "ghp_" + "x".repeat(36), text: "portable value" }), stamp);
  setting.run("private-setting", JSON.stringify(sentinel), stamp);
  setting.run("secret-setting", JSON.stringify(sentinel), stamp);
  sql.prepare("INSERT INTO setting_values_global (setting_id,value_json,state,def_version,seq,updated_by,updated_at) VALUES ('title',?,'set',1,1,'owner',?)").run(JSON.stringify(sentinel), stamp);
  sql.prepare("INSERT INTO setting_values_user (setting_id,workspace_id,principal_id,value_json,state,def_version,seq,updated_by,updated_at) VALUES ('title','ws','owner',?,'set',1,1,'owner',?)").run(JSON.stringify(sentinel), stamp);
  sql.exec("CREATE TABLE secret_fixture_user (payload TEXT)");
  sql.prepare("INSERT INTO secret_fixture_user VALUES (?)").run(sentinel);
  // This table is unknown and must be refused until the fixture removes it explicitly.
  return { dir, db, sql, mediaBytes, hash, storageKey };
}

function common(database: Buffer) {
  return { bufferedFiles: [{ path: "settings.json", content: Buffer.from("{}") }], include: { database: true, media: true, themes: true, plugins: true, settings: true }, database: { bytes: database, watermarkAtCapture: 0 }, files: [], skipped: [], scopeNotes: {}, totalBytes: database.length, site: { name: "Site", folderName: "site" }, schema: { index: 13, tag: "0013_unify_vault_credentials" }, tovuVersion: "test", createdAt: stamp };
}

test("ZIP target uses the common plan/manifest; repository plans retain their original contract", async () => {
  const bytes = Buffer.from("sqlite fixture");
  const store = new SiteBackupPlanStore();
  const repository = { credentialLabel: "private", owner: "owner", repo: "repo", folder: "site", commitMessage: "backup", repository: { branch: "main", parentCommitSha: "parent", baseTreeSha: "tree", htmlUrl: "https://example.test/repo", folderExists: false } };
  const saved = store.save({ principalId: "owner", workspaceId: "ws", content: { ...common(bytes), ...repository } });
  const taken = store.take({ planId: saved.planId, principalId: "owner", workspaceId: "ws" });
  assert.equal(taken.ok, true);
  if (taken.ok) {
    assert.equal(taken.plan.repository.branch, "main");
    const provider = { backupInlineTextMaxBytes: 1_000_000 } as SourceControlProvider;
    const uploaded = await uploadPlannedContent({ plan: taken.plan, provider, target: { baseUrl: "https://example.test", authorization: "test", owner: "owner", repo: "repo" }, signal: new AbortController().signal, progress: initialPushProgress(taken.plan), toRefusal: failure => ({ ok: false, code: failure.code, message: failure.message }) });
    assert.equal(uploaded.ok, true);
    if (uploaded.ok) {
      assert.equal(uploaded.entries[0]!.path, "database/content.db");
      assert.equal(uploaded.entries.at(-1)!.path, "tovu-backup.json");
      const manifest = uploaded.entries.at(-1);
      assert.ok(manifest && 'text' in manifest, "the repository manifest is inline text");
      assert.equal(manifest.text.includes('"profile"'), false, "repository manifests keep their original format");
    }
  }
  const zip = await buildShareZip({ plan: { ...common(bytes), profile: "share", target: { kind: "zip" }, bufferedFiles: [{ path: "settings.json", content: Buffer.from("{}") }] }, zip: zipFolderFiles });
  assert.ok(zip.includes(Buffer.from('"profile": "share"')));
  assert.ok(zip.includes(Buffer.from('"formatVersion": 2')));
});

test("fresh share projection preserves drafts/schedules/autosaves, excludes private rows and secret bytes across the WHOLE zip", async (t) => {
  const { sql, dir, mediaBytes, hash, storageKey } = await fixture(t);
  sql.exec("DROP TABLE secret_fixture_user");
  const write = async (relative: string, text: string) => { const file = path.join(dir, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text); };
  await write("themes/static/site/index.html", "<main>Portable theme</main>");
  await write("themes/static/site/data/content.json", '{"content":"required theme data"}');
  // Before: a legacy `1.0/` folder with a bare `{id, version}` manifest. After: an installed plugin as
  // Jini lays it out; the share carries exactly its manifest and integrity files (design 2026-10-27 P1).
  installSitePlugin({ installDir: path.join(dir, "plugins"), id: "site", version: "1.0.0", package: {
    "plugin.json": '{"name":"portable"}', "src/data/default.json": '{"content":"required plugin data"}', "src/notes/help.md": "Required plugin documentation",
  } });
  await write("themes/static/site/out/main.js", "console.log('required output')");
  await write("overrides/page.html", "<main>Page override</main>");
  for (const file of ["themes/static/site/nested/.env.local", "plugins/site/1.0.0/data/oauth.json", "plugins/site/1.0.0/memory/private/facts.md", "plugins/site/1.0.0/nested/chat.db-wal", "uploads/chat-attachments/private.txt"]) await write(file, sentinel);
  await write("config.json", JSON.stringify({ name: "Shared site", domain: "private.local", port: 1234, password: sentinel }));
  await write(".site-meta.json", JSON.stringify({ templateId: "starter", templateVersion: "1", schemaVersion: 13, siteId: sentinel, siteKeyId: sentinel, storage: sentinel }));
  const sources = { siteDir: dir, mediaUploadsDir: null, themesDir: path.join(dir, "themes"), agentPlugins: resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: path.join(dir, "agent-plugins") } }), skillsDir: path.join(dir, "skills"), tovuVersion: "test", sitePlugins: jiniSitePlugins({ installDir: path.join(dir, "plugins") }) };
  const readKeys: string[] = [];
  const plan = await prepareShareContent({ snapshotRoot: tmpdir(), sources, sanitize: sanitizeShareDatabase, rewriteMedia: rewriteArchiveMedia, imageTransformer: { transform: async () => assert.fail("not raster") },
    blobStore: { get: async ({ storageKey: key }) => { readKeys.push(key); return mediaBytes; }, sizeOf: async () => mediaBytes.length },
    dbOps: { getCapabilities: async () => ({ restorePoint: { costClass: "cheap", kind: "file-snapshot" } }), captureRestorePoint: async () => { const artifactRef = path.join(dir, "snapshot.db"); await writeFile(artifactRef, sql.serialize()); return { artifactRef, watermarkAtCapture: 42 }; }, restoreFromArtifact: async () => { throw new Error("must never restore"); } },
  });
  assert.deepEqual(readKeys, [storageKey], "S3 bytes come through the existing store, not uploadsDir");
  const zip = await buildShareZip({ plan, zip: zipFolderFiles });
  assert.equal(zip.includes(Buffer.from(sentinel)), false, "scan the complete ZIP, including SQLite free pages");
  const entries = new Map<string, Buffer>();
  const reader = createYauzlAgentPluginArchiveReader({ yauzl: yauzl as unknown as YauzlPort });
  for await (const entry of reader.entries({ archive: zip })) {
    assert.equal(entry.kind, "file");
    if (entry.kind !== "file") continue;
    const chunks: Buffer[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
    entries.set(entry.entryPath, Buffer.concat(chunks));
  }
  assert.equal(entries.get("media/media.bin")?.toString(), mediaBytes.toString());
  assert.equal(createHash("sha256").update(entries.get("media/media.bin")!).digest("hex"), hash);
  for (const file of ["themes/site/index.html", "themes/site/data/content.json", "plugins/site/package/plugin.json", "plugins/site/package/src/data/default.json", "plugins/site/package/src/notes/help.md", "themes/site/out/main.js", "themes/__overrides__/page.html"]) assert.ok(entries.has(file), file);
  assert.deepEqual(JSON.parse(entries.get("settings.json")!.toString()), { name: "Shared site", template: { templateId: "starter", templateVersion: "1", schemaVersion: 13 } });
  assert.deepEqual(Object.keys(JSON.parse(entries.get("settings.json")!.toString()).template).sort(), ["schemaVersion", "templateId", "templateVersion"]);
  const shared = new Database(entries.get("content.db")!);
  t.after(() => shared.close());
  assert.deepEqual(shared.prepare("SELECT * FROM posts ORDER BY id").all(), sql.prepare("SELECT * FROM posts ORDER BY id").all());
  for (const table of ["media", "menus", "nav_location_bindings", "presentation_settings"]) assert.deepEqual(shared.prepare(`SELECT * FROM "${table}"`).all(), sql.prepare(`SELECT * FROM "${table}"`).all(), table);
  // An unsniffed (null) content_type is filled with the archive's sniffed type; every other column is kept.
  assert.deepEqual(shared.prepare(`SELECT * FROM "asset_blobs"`).all(), sql.prepare(`SELECT * FROM "asset_blobs"`).all().map(row => ({ ...(row as object), content_type: "application/octet-stream" })), "asset_blobs");
  for (const table of ["principals", "identity_users", "members", "sessions", "api_keys", "secrets_vault", "setting_values_global", "setting_values_user", "setting_revisions"]) assert.equal((shared.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n, 0, table);
  assert.deepEqual(shared.prepare("SELECT setting_id FROM setting_definitions ORDER BY setting_id").all(), [{ setting_id: "title" }]);
  assert.equal((shared.prepare("SELECT count(*) AS n FROM post_search_document").get() as { n: number }).n, 4, "search is rebuilt from portable posts");
  await assert.rejects(readFile(path.join(dir, "snapshot.db")), /ENOENT/, "snapshot staging is cleaned");
});

test("unknown nonempty tables cause a refusal naming the unsupported table", async (t) => {
  const { sql } = await fixture(t);
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), /secret_fixture_user/);
});

test("v1 refuses above the expanded/file cap instead of silently omitting required content", async () => {
  await assert.rejects(buildShareZip({ plan: { ...common(Buffer.alloc(0)), target: { kind: "zip" }, profile: "share", files: Array.from({ length: SHARE_LIMITS.maxFiles + 1 }, (_, n) => ({ path: `themes/${n}`, bytes: 0, absPath: "unused", mtimeMs: 0, scope: "themes" as const })) }, zip: zipFolderFiles }), /2,?000|file.*cap/i);
  await assert.rejects(buildShareZip({ plan: { ...common(Buffer.alloc(0)), target: { kind: "zip" }, profile: "share", totalBytes: SHARE_LIMITS.maxExpandedBytes + 1 }, zip: zipFolderFiles }), /300 MiB/);
});

test("unsafe archive paths, aliases and file/directory collisions are refused before encoding", async () => {
  const refused = async (paths: string[]) => assert.rejects(buildShareZip({ plan: { ...common(Buffer.alloc(0)), target: { kind: "zip" }, profile: "share", bufferedFiles: paths.map(path => ({ path, content: Buffer.from("content") })) }, zip: zipFolderFiles }), /unsafe|Duplicate|collision/i);
  for (const path of ["/absolute", "C:/drive", "../escape", "themes/../escape", "themes\\escape", "themes/\0escape", "themes/trailing.", "themes/e\u0301.html"]) await refused([path]);
  // Review B-3 RED: A used whole-path lowercase, missing ancestor and Unicode aliases.
  for (const paths of [["themes/Dir/a", "themes/dir/b"], ["themes/SS/a", "themes/ß/b"], ["themes/Σ/a", "themes/ς/b"], ["themes/Ｆ.txt"], ["themes/CON.txt"]]) await refused(paths);
  await refused(["themes/A.html", "themes/a.html"]);
  await refused(["themes/file", "themes/file/child"]);
});

test("credential-shaped bytes in required content refuse the share without changing the file", async () => {
  const secret = "ghp_" + "x".repeat(36);
  const content = Buffer.from(`const token = "${secret}";`);
  await assert.rejects(buildShareZip({ plan: { ...common(Buffer.alloc(0)), target: { kind: "zip" }, profile: "share", bufferedFiles: [{ path: "themes/site/script.js", content }] }, zip: zipFolderFiles }), /contains credential-shaped content/);
  assert.equal(content.toString(), `const token = "${secret}";`);
});

test("create → anonymous GET with private download headers; revoke → 404 and artifact removed; list retains both statuses", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-share-route-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const registry = new SiteShareRegistry({ directory: path.join(dir, ".hidden", "shares") });
  const app = express();
  registerPublicShareRoutes({ app, registry });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const delivery = createRuntimeShareDelivery({ registry, site: "ws", publicOrigin: "https://share.example.test", http: { send: async ({ request }) => { const response = await fetch(`${base}${new URL(request.url).pathname}`, { method: request.method }); return { status: response.status, headers: Object.fromEntries(response.headers), bodyText: "" }; } } });
  const created = await createSiteShare({ registry, site: "ws", name: "site", archive: Buffer.from("PK fixture") }, { delivery });
  assert.match(created.url!, /^https:\/\/share\.example\.test\/_share\//);
  const response = await fetch(`${base}/_share/${created.token}/site.tovu.zip`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition")!, /attachment/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from("PK fixture"));
  assert.equal((await fetch(`${base}/_share/${"z".repeat(16)}/site.tovu.zip`)).status, 404);
  assert.equal((await fetch(`${base}/_share/${created.token}/other.tovu.zip`)).status, 404);
  const failed = await createSiteShare({ registry, site: "ws", name: "failed", archive: Buffer.from("PK failed") });
  await registry.put({ record: { ...failed, status: "failed" } });
  assert.equal((await fetch(`${base}/_share/${failed.token}/${failed.file}`)).status, 404);
  // Local cleanup must succeed even after the public-origin override has been removed.
  await revokeSiteShare({ registry, site: "ws", shareId: created.shareId });
  assert.equal((await fetch(`${base}/_share/${created.token}/site.tovu.zip`)).status, 404);
  await assert.rejects(readFile(registry.artifactPath({ shareId: created.shareId })), /ENOENT/);
  const second = await createSiteShare({ registry, site: "ws", name: "site", archive: Buffer.from("PK second") });
  assert.deepEqual((await registry.list({ site: "ws" })).map(row => row.status).sort(), ["active", "failed", "revoked"]);
  assert.notEqual(second.token, created.token);
});

// RED before review fixes: prose rejected as secrets; settings rewritten; required paths omitted.
test("ordinary prose, theme query strings and SEO defaults/values survive byte-for-byte", async t => {
  const { sql } = await fixture(t);
  sql.exec("DROP TABLE secret_fixture_user");
  const prose = "Basic usage; password: must be at least 8 characters";
  const seo = "Basic tips for a private garden";
  sql.prepare("UPDATE posts SET title = ? WHERE id = 'p0'").run(prose);
  sql.prepare("UPDATE setting_definitions SET schema_json = ?, default_json = ? WHERE setting_id = 'description'").run('{"type":"string"}', JSON.stringify(seo));
  sql.prepare("UPDATE setting_values_workspace SET value_json = ? WHERE setting_id = 'description'").run(JSON.stringify(prose));
  const projected = await sanitizeShareDatabase({ snapshot: sql.serialize() });
  const shared = new Database(projected.bytes);
  t.after(() => shared.close());
  assert.equal((shared.prepare("SELECT title FROM posts WHERE id = 'p0'").get() as { title: string }).title, prose);
  assert.equal((shared.prepare("SELECT default_json FROM setting_definitions WHERE setting_id = 'description'").get() as { default_json: string }).default_json, JSON.stringify(seo));
  assert.equal((shared.prepare("SELECT value_json FROM setting_values_workspace WHERE setting_id = 'description'").get() as { value_json: string }).value_json, JSON.stringify(prose));
  const js = 'const url = base + "?key="; // Basic usage';
  const zip = await buildShareZip({ plan: { ...common(projected.bytes), profile: "share", target: { kind: "zip" }, bufferedFiles: [...common(projected.bytes).bufferedFiles, { path: "themes/site/script.js", content: Buffer.from(js) }] }, zip: zipFolderFiles });
  const reader = createYauzlAgentPluginArchiveReader({ yauzl: yauzl as unknown as YauzlPort });
  let found = false;
  for await (const entry of reader.entries({ archive: zip })) {
    if (entry.entryPath !== "themes/site/script.js" || entry.kind !== "file") continue;
    const chunks: Buffer[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
    assert.equal(Buffer.concat(chunks).toString(), js);
    found = true;
  }
  assert.equal(found, true);
});

test("share excludes only private locations; required nested data/notes/out survive and suspect names refuse", () => {
  // Site plugin data/ and private memory are never walked (only Jini's package listing is), so no path rule covers them.
  for (const file of ["themes/static/site/.env.local", "themes/static/site/nested/chat.db-wal"]) assert.equal(excludedSharePath({ path: file }), true, file);
  for (const file of ["themes/static/site/out/main.js", "themes/static/site/ops/help.md", "themes/static/site/staging/help.md", "plugins/site/src/data/default.json", "plugins/site/src/notes/help.md", "plugins/site/src/learned/help.md"]) assert.equal(excludedSharePath({ path: file }), false, file);
  for (const file of ["themes/static/site/key.pem", "plugins/site/src/credentials.json", "themes/static/site/vault/readme.md", "plugins/site/src/.npmrc"]) assert.throws(() => excludedSharePath({ path: file }), (error: unknown) => (error as { code: string }).code === "UNSAFE_FILE", file);
});

// RED: nested JSON values used to be rewritten rather than omitted, or missed after double encoding.
test("secret-bearing setting values are omitted without changing their safe definition", async t => {
  const { sql } = await fixture(t);
  sql.exec("DROP TABLE secret_fixture_user");
  sql.prepare("UPDATE setting_definitions SET schema_json = ? WHERE setting_id = 'title'").run('{"type":"json"}');
  sql.prepare("UPDATE setting_values_workspace SET value_json = ? WHERE setting_id = 'title'").run(JSON.stringify({ password: "actual-secret-value-12345678" }));
  const projected = await sanitizeShareDatabase({ snapshot: sql.serialize() });
  const shared = new Database(projected.bytes);
  t.after(() => shared.close());
  assert.equal((shared.prepare("SELECT count(*) AS n FROM setting_values_workspace WHERE setting_id = 'title'").get() as { n: number }).n, 0);
  assert.equal((shared.prepare("SELECT default_json FROM setting_definitions WHERE setting_id = 'title'").get() as { default_json: string }).default_json, '"Default title"');
});
