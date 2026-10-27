/** Real A→B fixtures, isolated catalog/home and real SQLite; no owner files or running server. */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { login } from "@jini-ai/user-management/server";
import { AuthInvalidCredentialsError } from "@jini-ai/user-management";
import argon2 from "argon2";
import { createSqliteIdentityRouteDeps } from "../../identity/wiring.js";
import { createPermissionGrantRegistry } from "../../identity/permission-grants.js";
import { contentKernel } from "../../../platform/db/content-kernel.js";
import { identityServiceDepsFrom } from "../../../server/inbound/admin-http/routes/users/deps.js";
import { resolveSiteDatabasePaths } from "../../../platform/site-dir/site-databases.js";
import { readTemplate } from "../../../platform/site-dir/read-template.js";
import type { TestContext } from "node:test";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import * as yauzl from "yauzl";
import { openContentDb } from "../../../platform/db/sqlite/content-db.js";
import { closeSqliteConnection } from "../../../platform/db/kernel/drivers/sqlite.js";
import { sanitizeShareDatabase, rewriteArchiveMedia } from "../../../platform/db/sqlite/share-database.js";
import { rebuildImportDatabase } from "../../../platform/db/sqlite/import-database.js";
import { runtimeSchemaVersion } from "../../../platform/site-dir/schema-guard.js";
import { createSitesWorkspace } from "../../../platform/site-dir/sites-home.js";
import { buildShareZip } from "../share-zip.js";
import { fixtureArchivePlan, fixtureManifest } from "./archive.fixture.js";
import { createSiteImportBackend } from "../import-backend.js";
import { SiteImportRegistry } from "../import-registry.js";
import { createShareArchiveReader } from "../import-archive-reader.js";
import { SHARE_LIMITS } from "../share-policy.js";
import { prepareShareContent } from "../share-preparation.js";

import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { FIRST_PARTY_DATA_MODULES } from "../../plugins/data-modules.js";
import { declareDataModule } from "../../plugins/data-module.js";
import { ensureDefaultList } from "../../newsletter/lists.js";
import { SqliteNewsletterListRepo } from "../../newsletter/repo.sqlite.js";
import type { SiteSharePlanContent } from "../plan-store.js";

export const OWNER_PASSWORD = "recipient-only-password";
export const MEDIA = Buffer.from("import-media-fixture");
export const HASH = createHash("sha256").update(MEDIA).digest("hex");
export const STORAGE_KEY = "ws/ws/blobs/" + HASH.slice(0, 2) + "/" + HASH;
export const reader = createShareArchiveReader({ yauzl });
export const stamp = "2026-10-18T00:00:00.000Z";

export async function importFixture(t: TestContext, placement: "inSite" | "appData" = "inSite") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-import-b-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "sites"));
  const options = { homeDir: root, cwd: root, appDataDir: path.join(root, "profile"), env: { TOVU_SITES_HOME: path.join(root, "sites") } };
  const workspace = createSitesWorkspace({}, options);
  workspace.updateConfig({ patch: { databases: placement } });
  const db = openContentDb({ filePath: ":memory:" });
  t.after(() => closeSqliteConnection(db));
  db.$client.prepare("INSERT INTO workspaces (id,slug,name,created_at) VALUES ('ws','portable','Portable',?)").run(stamp);
  for (const [index, status] of ["draft", "published", "published", "draft"].entries()) {
    db.$client.prepare("INSERT INTO posts (id,workspace_id,title,slug,body_json,status,kind,updated_at,autosave_json,publish_at,version) VALUES (?,'ws',?,?,?, ?,?,?,?, ?,1)")
      .run("post-" + index, "Title " + index, "slug-" + index, '{"type":"doc"}', status, index % 2 ? "page" : "post", stamp, '{"title":"standing draft"}', index === 1 ? "2030-01-01T00:00:00.000Z" : null);
  }
  db.$client.prepare("INSERT INTO presentation_settings (workspace_id,active_theme_id,updated_at) VALUES ('ws','static/site',?)").run(stamp);
  db.$client.prepare("INSERT INTO menus (id,workspace_id,slug,title,status,doc_json,locations_json,updated_at,version) VALUES ('menu','ws','main','Main','active','{\"items\":[]}','[\"header\"]',?,1)").run(stamp);
  db.$client.prepare("INSERT INTO nav_location_bindings (workspace_id,location_key,menu_id,bound_at) VALUES ('ws','header','menu',?)").run(stamp);
  db.$client.prepare("INSERT INTO asset_blobs (id,workspace_id,sha256,storage_key,created_by_principal,created_at,status) VALUES ('blob','ws',?,?,'source-owner',?,'active')").run(HASH, STORAGE_KEY, stamp);
  db.$client.prepare("INSERT INTO media (id,workspace_id,title,alt,caption,credit,source_sha256,status,created_at,updated_at,version) VALUES ('media','ws','Image','','','',?,'active',?,?,1)").run(HASH, stamp, stamp);
  db.$client.prepare("INSERT INTO principals (id,workspace_id,kind,display_name,status,created_at) VALUES ('source-owner','ws','user','Source','active',?)").run(stamp);
  const sourceHash = await argon2.hash("source-password");
  assert.equal(await argon2.verify(sourceHash, "source-password"), true);
  db.$client.prepare("INSERT INTO identity_users (principal_id,workspace_id,username,password_hash) VALUES ('source-owner','ws','admin',?)").run(sourceHash);
  db.$client.prepare("INSERT INTO sessions (id,workspace_id,principal_id,token_hash,created_at,expires_at) VALUES ('session','ws','source-owner','source-session',?,?)").run(stamp, stamp);
  db.$client.prepare("INSERT INTO secrets_vault (workspace_id,id,kind,owner_key,label,is_default,revision,meta,created_at,updated_at) VALUES ('ws','vault','custom','tovu','source-secret',0,1,'{}',?,?)").run(stamp, stamp);
  db.$client.exec("CREATE TABLE ai_chats(payload TEXT); INSERT INTO ai_chats VALUES ('source-chat-private')");
  const safe = await sanitizeShareDatabase({ snapshot: db.$client.serialize() });
  db.$client.exec("DROP TABLE ai_chats");
  const files = new Map([
    ["database/content.db", safe.bytes], ["uploads/" + STORAGE_KEY, MEDIA],
    ["themes/static/site/index.html", Buffer.from("<main>Portable</main>")],
    ["themes/static/site/theme.json", Buffer.from('{"id":"site","name":"Portable","version":"1.0.0","tier":"static"}')],
    ["themes/static/site/tokens.json", Buffer.from("{}")],
    ["themes/static/site/pages/index.html", Buffer.from('<!doctype html><html><head><link rel="stylesheet" href="../css/styles.css" /></head><body>Portable</body></html>')],
    ["themes/static/site/css/styles.css", Buffer.from("body{margin:0}")],
    ["themes/static/site/js/site.js", Buffer.from("window.importedTheme = true;")],
    ["themes/code/executable/theme.json", Buffer.from('{"id":"executable","tier":"code"}')],
    ["themes/code/executable/index.ts", Buffer.from("throw new Error('must never execute')")],
    ["plugins/custom/plugin.json", Buffer.from('{"id":"custom"}')],
    ["skills/custom/SKILL.md", Buffer.from("Never execute on import")],
    ["settings/config.json", Buffer.from('{"name":"Portable","domain":null,"port":null}')],
  ]);
  const runtimePlan: SiteSharePlanContent = {
    target: { kind: "zip" }, profile: "share", createdAt: stamp, tovuVersion: "test", schema: runtimeSchemaVersion(),
    site: { name: "Portable", folderName: "portable" }, include: { database: true, media: true, themes: true, plugins: true, settings: true }, scopeNotes: {}, skipped: [],
    database: { bytes: safe.bytes, watermarkAtCapture: 0 }, files: [],
    bufferedFiles: [...files].filter(([name]) => name !== "database/content.db").map(([name, content]) => ({ path: name, content })),
    totalBytes: [...files.values()].reduce((n, bytes) => n + bytes.length, 0),
  };
  const plan = fixtureArchivePlan({ plan: runtimePlan });
  const registry = new SiteImportRegistry({ directory: path.join(root, "private") });
  const started: string[] = [];
  const backendPorts = { registry, workspace, reader, sanitize: rebuildImportDatabase, schema: runtimeSchemaVersion(),
    http: { send: async () => { throw new Error("unexpected network"); } },
    startSite: async ({ name }: { name: string }) => { started.push(name); return { adminUrl: "http://localhost:3101/admin", status: "running" }; },
    creationOptions: options,
  };
  const backend = createSiteImportBackend(backendPorts);
  const archive = await buildShareZip({ plan, zip: zipFolderFiles });
  // Hostile fixtures bypass A's projection, but retain a schema-valid DB and exact ZIP hashes.
  const archiveWithDatabase = async (snapshot: Buffer) => {
    const nextPlan = fixtureArchivePlan({ plan: { ...runtimePlan, database: { bytes: snapshot, watermarkAtCapture: 0 } }, files });
    const entries = new Map(nextPlan.bufferedFiles!.map(file => [file.path, file.content])); entries.set("content.db", snapshot);
    entries.set("manifest.json", Buffer.from(fixtureManifest({ plan: nextPlan, files: entries })));
    const picked = [...entries].map(([name, bytes]) => {
      const file = new File([bytes as BlobPart], name.split("/").at(-1)!);
      Object.defineProperty(file, "webkitRelativePath", { value: "share/" + name });
      return file;
    });
    return Buffer.from(await (await zipFolderFiles({ files: picked, maxBytes: SHARE_LIMITS.maxArchiveBytes })).arrayBuffer());
  };
  const prepareProductionShare = async () => {
    const siteDir = path.join(root, "source");
    fs.mkdirSync(siteDir, { recursive: true });
    for (const [name, bytes] of files) {
      if (name.startsWith("database/") || name.startsWith("uploads/")) continue;
      const relative = name.startsWith("settings/") ? name.slice("settings/".length) : name;
      fs.mkdirSync(path.dirname(path.join(siteDir, relative)), { recursive: true });
      fs.writeFileSync(path.join(siteDir, relative), bytes);
    }
    fs.writeFileSync(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: "source-site", schemaVersion: runtimeSchemaVersion().index }));
    const readKeys: string[] = [];
    const productionPlan = await prepareShareContent({
      sources: { siteDir, mediaUploadsDir: null, themesDir: path.join(siteDir, "themes"), skillsDir: path.join(siteDir, "skills"), agentPlugins: resolveAgentPluginLayout({ siteDir, env: {} }), tovuVersion: "test" },
      sanitize: sanitizeShareDatabase, rewriteMedia: rewriteArchiveMedia, imageTransformer: { transform: async () => assert.fail("fixture media is not raster") },
      blobStore: { get: async ({ storageKey }) => { assert.equal(storageKey, STORAGE_KEY); readKeys.push(storageKey); return MEDIA; }, sizeOf: async ({ storageKey }) => { assert.equal(storageKey, STORAGE_KEY); return MEDIA.length; } },
      dbOps: { getCapabilities: async () => ({ restorePoint: { costClass: "cheap", kind: "file-snapshot" } }), captureRestorePoint: async () => {
        const artifactRef = path.join(root, "share-snapshot.db");
        fs.writeFileSync(artifactRef, db.$client.serialize());
        return { artifactRef, watermarkAtCapture: 42 };
      }, restoreFromArtifact: async () => { throw new Error("must not restore source"); } },
    });
    assert.deepEqual(readKeys, [STORAGE_KEY], "object-storage media must be read through the store");
    assert.equal(fs.existsSync(path.join(siteDir, "uploads", STORAGE_KEY)), false);
    return { archive: await buildShareZip({ plan: productionPlan, zip: zipFolderFiles }), plan: productionPlan, readKeys };
  };
  const assertOwnerLogin = async (required: { dir: string; rejectedPassword: string }) => {
    const imported = openContentDb({ filePath: resolveSiteDatabasePaths({ dir: required.dir }, { workspace }).contentDbPath });
    try {
      const workspaceId = readTemplate({ templateId: "starter" }).seed.workspace.id;
      const clock = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() }, idGen = { newId: () => randomUUID() };
      const identity = createSqliteIdentityRouteDeps({ db: contentKernel(imported), workspaceId, clock, idGen,
        permissionGrants: createPermissionGrantRegistry({}), ownerCredentials: { username: "admin", password: "deployment-password" } });
      await identity.identityReady;
      const deps = identityServiceDepsFrom({ ...identity, clock, idGen });
      const input = { workspaceId, username: "admin", password: OWNER_PASSWORD };
      assert.equal((await login({ deps, input })).principal.id, await identity.ownerPrincipalId);
      await assert.rejects(login({ deps, input: { ...input, password: required.rejectedPassword } }), AuthInvalidCredentialsError);
    } finally { closeSqliteConnection(imported); }
  };
  return { root, db, safe, files, archive, plan, registry, backend, backendPorts, workspace, started, assertOwnerLogin, archiveWithDatabase, prepareProductionShare };
}

/** Seed the real default list plus populated private tables; all private fields carry a sentinel. */
export async function seedPluginShareData({ db }: { db: ReturnType<typeof openContentDb> }, _options: Record<string, never> = {}): Promise<void> {
  for (const decl of FIRST_PARTY_DATA_MODULES.filter(decl => ["newsletter", "comments"].includes(decl.pluginId))) {
    const result = await declareDataModule({ db, dbPath: ":memory:", decl });
    assert.equal(result.ok, true, result.error?.message);
    for (const table of decl.tables) {
      if (table.portability?.kind !== "private") continue;
      const columns = table.columns.map(column => '"' + column.name + '"').join(",");
      const values = table.columns.map(column => column.name === "workspace_id" ? "ws" : column.type === "TEXT" ? "private-visitor@example.test" : 1);
      db.$client.prepare(`INSERT INTO "p_${decl.pluginId}__${table.name}" (${columns}) VALUES (${values.map(() => "?").join(",")})`).run(...values);
    }
  }
  await ensureDefaultList({ deps: { listRepo: new SqliteNewsletterListRepo(db), clock: { nowIso: () => stamp }, ids: { newId: () => "default-list" } }, input: { workspaceId: "ws" } });
  // Historical/additive per-person fields must not travel with otherwise portable lists.
  db.$client.exec("ALTER TABLE p_newsletter__lists ADD COLUMN owner_email TEXT");
  db.$client.prepare("UPDATE p_newsletter__lists SET owner_email=?").run("private-visitor@example.test");
}
