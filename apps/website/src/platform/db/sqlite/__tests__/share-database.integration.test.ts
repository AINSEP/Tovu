import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { statfs } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import { SITE_CONSENT_DEFAULTS } from "#src/features/consent/config";
import { computeBlobStorageKey, MediaValidationError } from "#src/features/media/index";
import { SHARE_LIMITS, SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { declareDataModule, type DataModuleDecl } from "#src/features/plugins/data-module";
import { NEWSLETTER_DATA_MODULE } from "#src/features/newsletter/data-module-manifest";
import { sqliteKernel } from "../../kernel/drivers/sqlite.js";
import { listColumns, listTables } from "../../kernel/dialect.js";
import { openContentDb } from "../content-db.js";
import { prepareSharePluginTables, sanitizeShareDatabase, type StagingSpacePort } from "../share-database.js";

/**
 * @file Boundary pins for the share projection (`../share-database.ts`) against real in-memory
 * SQLite: every refusal names its code and exact message, and every projection rule (media kinds,
 * sidecar ownership, document references, portable settings, plugin tables) is observed in the
 * bytes a share would carry. This file is security-sensitive: a share must never carry private rows.
 */

const stamp = "2026-10-18T12:00:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const blobKey = (sha256: string): string => computeBlobStorageKey({ workspaceId: "ws", sha256 });
const DOCUMENT_REFUSAL = "Document source blob is missing or has an invalid key/hash.";

type Sql = Database.Database;
type Row = Record<string, unknown>;

/** A migrated, empty content db with one workspace; closed when the test ends. */
function sourceDb(t: TestContext): { sql: Sql; db: ReturnType<typeof openContentDb> } {
  const db = openContentDb({ filePath: ":memory:" });
  t.after(() => db.$client.close());
  db.$client.prepare("INSERT INTO workspaces (id,slug,name,created_at) VALUES ('ws','site','Site',?)").run(stamp);
  return { sql: db.$client, db };
}

/** Runs the projection and opens its bytes; the opened copy is closed when the test ends. */
async function share(t: TestContext, sql: Sql, optional: Parameters<typeof sanitizeShareDatabase>[1] = {}) {
  const projection = await sanitizeShareDatabase({ snapshot: sql.serialize() }, optional);
  const shared = new Database(projection.bytes);
  t.after(() => shared.close());
  return { projection, shared, rows: (table: string): Row[] => shared.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all() as Row[] };
}

/** Matcher for one specific SiteShareRefusal. */
function refusal(code: string, message: string): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof SiteShareRefusal, String(error));
    assert.equal(error.code, code);
    assert.equal(error.message, message);
    return true;
  };
}

function insertMedia(sql: Sql, row: { id: string; sha: string; kind?: string; status?: string; originalFilename?: string | null; createdBy?: string }): void {
  sql.prepare("INSERT INTO media (id,workspace_id,kind,original_filename,created_by,title,alt,caption,credit,source_sha256,status,created_at,updated_at,version) VALUES (?,'ws',?,?,?,'Title','','','',?,?,?,?,1)")
    .run(row.id, row.kind ?? "media", row.originalFilename === undefined ? null : row.originalFilename, row.createdBy ?? "uploader", row.sha, row.status ?? "active", stamp, stamp);
}

function insertDocument(sql: Sql, row: { id: string; sha: string; status?: string; originalFilename?: string | null }): void {
  insertMedia(sql, { ...row, kind: "document", originalFilename: row.originalFilename === undefined ? `${row.id}.md` : row.originalFilename });
}

function insertBlob(sql: Sql, row: { id: string; sha: string; storageKey?: string; status?: string; documentOwned?: number; workspace?: string }): void {
  sql.prepare("INSERT INTO asset_blobs (id,workspace_id,sha256,storage_key,created_by_principal,created_at,status,document_owned) VALUES (?,?,?,?,'owner',?,?,?)")
    .run(row.id, row.workspace ?? "ws", row.sha, row.storageKey ?? blobKey(row.sha), stamp, row.status ?? "active", row.documentOwned ?? 0);
}

function insertRendition(sql: Sql, row: { id: string; assetId: string; storageKey: string; transform?: string }): void {
  sql.prepare("INSERT INTO asset_renditions (id,workspace_id,asset_id,transform_name,version,storage_key,created_at) VALUES (?,'ws',?,?,1,?,?)")
    .run(row.id, row.assetId, row.transform ?? "original", row.storageKey, stamp);
}

function insertDefinition(sql: Sql, row: { id: string; namespace: string; key: string; schema?: string; defaultJson?: string | null; scopes?: number; secret?: number; status?: string; version?: number }): void {
  sql.prepare("INSERT INTO setting_definitions (setting_id,version,namespace,key,owner_kind,schema_json,default_json,scopes,secret,status,created_at,updated_at) VALUES (?,?,?,?,'core',?,?,?,?,?,?,?)")
    .run(row.id, row.version ?? 1, row.namespace, row.key, row.schema ?? '{"type":"string"}', row.defaultJson === undefined ? '"default"' : row.defaultJson, row.scopes ?? 2, row.secret ?? 0, row.status ?? "active", stamp, stamp);
}

function insertValue(sql: Sql, row: { id: string; valueJson: string | null; state?: string; defVersion?: number }): void {
  sql.prepare("INSERT INTO setting_values_workspace (setting_id,workspace_id,value_json,state,def_version,seq,updated_by,updated_at) VALUES (?,'ws',?,?,?,1,'owner',?)")
    .run(row.id, row.valueJson, row.state ?? "set", row.defVersion ?? 1, stamp);
}

/** A typed tier-2 fixture plugin declaring `tables`. */
function fixtureModule(tables: DataModuleDecl["tables"], pluginId = "fixture"): DataModuleDecl {
  return { pluginId, pluginTier: "tier-2", provenance: { sourceUrl: "https://example.test/fixture", publisher: "fixture" }, tables };
}

const NOTES_COLUMNS = [{ name: "id", type: "TEXT", primaryKey: true }, { name: "body", type: "TEXT" }, { name: "owner_email", type: "TEXT" }] as const;

// ---------------------------------------------------------------- sanitizeShareDatabase: refusals

test("an already-aborted signal refuses before any staging or free-space probe", async () => {
  let probed = false;
  const statfsPort: StagingSpacePort = async () => { probed = true; return { bavail: 1, bsize: 1 }; };
  await assert.rejects(sanitizeShareDatabase({ snapshot: Buffer.alloc(1) }, { signal: AbortSignal.abort(), statfs: statfsPort }), { name: "AbortError" });
  assert.equal(probed, false);
});

test("a snapshot above the expanded cap refuses with LIMIT_EXCEEDED before staging", async () => {
  let probed = false;
  const statfsPort: StagingSpacePort = async () => { probed = true; return { bavail: 1, bsize: 1 }; };
  await assert.rejects(sanitizeShareDatabase({ snapshot: Buffer.allocUnsafe(SHARE_LIMITS.maxExpandedBytes + 1) }, { statfs: statfsPort }), refusal("LIMIT_EXCEEDED", "Database exceeds the v1 300 MiB cap."));
  assert.equal(probed, false);
});

test("too little private staging space refuses with INSUFFICIENT_STORAGE and removes the staging directory", async () => {
  const snapshot = Buffer.alloc(100);
  let staging = "";
  // Exactly one byte short of the snapshot plus the 16 MiB headroom.
  const statfsPort: StagingSpacePort = async (dir) => { staging = dir; return { bavail: snapshot.length + 16 * 1024 * 1024 - 1, bsize: 1 }; };
  await assert.rejects(sanitizeShareDatabase({ snapshot }, { statfs: statfsPort }), refusal("INSUFFICIENT_STORAGE", "Insufficient private staging space for this database share."));
  assert.match(staging, /tovu-share-projection-/);
  assert.equal(existsSync(staging), false);
});

test("exactly enough staging space proceeds, and the staging directory is removed afterwards", async t => {
  const { sql } = sourceDb(t);
  let staging = "";
  const statfsPort: StagingSpacePort = async (dir) => { staging = dir; return { bavail: sql.serialize().length + 16 * 1024 * 1024, bsize: 1 }; };
  const { rows } = await share(t, sql, { statfs: statfsPort });
  assert.deepEqual(rows("workspaces"), [{ id: "ws", name: "Site", slug: "site", created_at: stamp }]);
  assert.equal(existsSync(staging), false);
});

test("a signal aborted mid-projection stops the copy and still removes staging", async t => {
  const { sql } = sourceDb(t);
  const controller = new AbortController();
  let staging = "";
  const pending = sanitizeShareDatabase({ snapshot: sql.serialize() }, { signal: controller.signal, statfs: async (dir) => { staging = dir; return statfs(dir); } });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(existsSync(staging), false);
});

test("a snapshot missing a required current table refuses with UNSUPPORTED_SCHEMA naming it", async t => {
  const { sql } = sourceDb(t);
  sql.exec("DROP TABLE member_tiers");
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), refusal("UNSUPPORTED_SCHEMA", "Share requires current table 'member_tiers'. Update this site first."));
});

test("a populated unknown table refuses with UNSUPPORTED_DATA naming it and the next step", async t => {
  const { sql } = sourceDb(t);
  sql.exec("CREATE TABLE stray_notes (payload TEXT); INSERT INTO stray_notes VALUES ('x')");
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), refusal("UNSUPPORTED_DATA", "Cannot share unsupported nonempty table 'stray_notes'. Add an approved portable-data policy for this table first."));
});

test("empty unknown tables and populated legacy-private, chat and vault-backup tables are skipped, never copied", async t => {
  const { sql } = sourceDb(t);
  for (const name of ["stray_empty", "site_assistant_credentials", "ai_chats", "_vault_backup_custom"]) sql.exec(`CREATE TABLE "${name}" (payload TEXT)`);
  for (const name of ["site_assistant_credentials", "ai_chats", "_vault_backup_custom"]) sql.prepare(`INSERT INTO "${name}" VALUES ('PRIVATE')`).run();
  const { shared } = await share(t, sql);
  const tables = (shared.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all() as { name: string }[]).map(row => row.name);
  for (const name of ["stray_empty", "site_assistant_credentials", "ai_chats", "_vault_backup_custom"]) assert.equal(tables.includes(name), false, name);
});

test("credential-shaped bytes anywhere in the projected database refuse with SECRET_IN_CONTENT", async t => {
  const { sql } = sourceDb(t);
  sql.prepare("UPDATE workspaces SET name = ?").run(`Site ${"ghp_" + "x".repeat(36)} name`);
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), refusal("SECRET_IN_CONTENT", "Share refused: 'database/content.db' contains credential-shaped content. Remove the secret before sharing."));
});

test("a credential glued to the previous column's text is refused by the projected-value scan", async t => {
  const { sql } = sourceDb(t);
  sql.prepare("UPDATE workspaces SET name = ?").run("ghp_" + "x".repeat(36));
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), refusal("SECRET_IN_CONTENT", "Share refused: 'database/content.db' contains credential-shaped content. Remove the secret before sharing."));
});

// ---------------------------------------------------------------- copyTable: trusted schema

test("a core table with an extra source column refuses with UNSUPPORTED_SCHEMA", async t => {
  const { sql } = sourceDb(t);
  sql.exec("ALTER TABLE menus ADD COLUMN injected TEXT");
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), refusal("UNSUPPORTED_SCHEMA", "Cannot share 'menus': its columns differ from the trusted current schema. Update the site first."));
});

test("a core table missing a column that has no historical default refuses with UNSUPPORTED_SCHEMA", async t => {
  const { sql } = sourceDb(t);
  sql.exec("ALTER TABLE media DROP COLUMN credit");
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), refusal("UNSUPPORTED_SCHEMA", "Cannot share 'media': its columns differ from the trusted current schema. Update the site first."));
});

test("an older share without the additive Library columns takes their trusted defaults", async t => {
  const { sql } = sourceDb(t);
  insertMedia(sql, { id: "m1", sha: SHA_A, originalFilename: "kept-out.png" });
  insertBlob(sql, { id: "b1", sha: SHA_A });
  sql.exec("ALTER TABLE media DROP COLUMN original_filename; ALTER TABLE media DROP COLUMN kind; ALTER TABLE asset_blobs DROP COLUMN document_owned");
  const { rows } = await share(t, sql);
  assert.deepEqual(rows("media").map(row => [row.id, row.kind, row.original_filename]), [["m1", "media", null]]);
  assert.deepEqual(rows("asset_blobs").map(row => [row.id, row.document_owned]), [["b1", 0]]);
});

test("a populated portable plugin table travels with only its policy columns; private plugin tables carry nothing", async t => {
  const { sql, db } = sourceDb(t);
  assert.equal((await declareDataModule({ db, dbPath: ":memory:", decl: NEWSLETTER_DATA_MODULE })).ok, true);
  sql.exec("ALTER TABLE p_newsletter__lists ADD COLUMN owner_email TEXT");
  sql.prepare("INSERT INTO p_newsletter__lists (id,workspace_id,name,slug,is_default,status,created_at,updated_at,owner_email) VALUES ('l1','ws','News','news',1,'active',?,?,'private@example.test')").run(stamp, stamp);
  sql.prepare("INSERT INTO p_newsletter__subscriptions (id,workspace_id,list_id,subscriber_id,status,source,created_at,updated_at) VALUES ('s1','ws','l1','sub','active','form',?,?)").run(stamp, stamp);
  const { rows, shared } = await share(t, sql);
  assert.deepEqual(rows("p_newsletter__lists"), [{ id: "l1", workspace_id: "ws", name: "News", slug: "news", is_default: 1, status: "active", created_at: stamp, updated_at: stamp }]);
  assert.equal(shared.prepare("SELECT name FROM sqlite_schema WHERE name = 'p_newsletter__subscriptions'").get(), undefined);
});

test("a portable plugin table missing one of its policy columns refuses with UNSUPPORTED_SCHEMA", async t => {
  const { sql, db } = sourceDb(t);
  assert.equal((await declareDataModule({ db, dbPath: ":memory:", decl: NEWSLETTER_DATA_MODULE })).ok, true);
  sql.exec("ALTER TABLE p_newsletter__lists DROP COLUMN status");
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), refusal("UNSUPPORTED_SCHEMA", "Cannot share 'p_newsletter__lists': its columns differ from the trusted current schema. Update the site first."));
});

// ---------------------------------------------------------------- mediaRowProjection: media rows

test("ordinary media travels unchanged; an active document loses its uploader; an inactive document is dropped", async t => {
  const { sql } = sourceDb(t);
  insertMedia(sql, { id: "m1", sha: SHA_A, createdBy: "uploader" });
  insertDocument(sql, { id: "d1", sha: SHA_B });
  insertDocument(sql, { id: "d2", sha: SHA_C, status: "trashed" });
  insertBlob(sql, { id: "b-b", sha: SHA_B });
  const { rows } = await share(t, sql);
  assert.deepEqual(rows("media").map(row => [row.id, row.kind, row.created_by]), [["m1", "media", "uploader"], ["d1", "document", null]]);
});

test("a media row of an unknown kind refuses with INVALID_DOCUMENT", async t => {
  const { sql } = sourceDb(t);
  sql.pragma("ignore_check_constraints = ON");
  insertMedia(sql, { id: "m1", sha: SHA_A, kind: "video" });
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), refusal("INVALID_DOCUMENT", "Unsupported media kind in share database."));
});

// ---------------------------------------------------------------- mediaRowProjection: sidecars

test("asset blobs: orphans drop; media-only blobs travel unchanged; document or document-owned blobs are marked share-owned", async t => {
  const { sql } = sourceDb(t);
  insertMedia(sql, { id: "m1", sha: SHA_A });
  insertMedia(sql, { id: "m2", sha: SHA_C, status: "trashed" });
  insertDocument(sql, { id: "d1", sha: SHA_B });
  insertBlob(sql, { id: "b-a", sha: SHA_A });
  insertBlob(sql, { id: "b-b", sha: SHA_B });
  insertBlob(sql, { id: "b-c", sha: SHA_C, documentOwned: 1 });
  insertBlob(sql, { id: "b-orphan", sha: "d".repeat(64) });
  const { rows, projection } = await share(t, sql);
  assert.deepEqual(rows("asset_blobs").map(row => [row.id, row.document_owned, row.created_by_principal]), [["b-a", 0, "owner"], ["b-b", 1, "share"], ["b-c", 1, "share"]]);
});

test("asset blobs: a same-hash blob in another workspace is not owned by this workspace's media", async t => {
  const { sql } = sourceDb(t);
  sql.prepare("INSERT INTO workspaces (id,slug,name,created_at) VALUES ('ws-other','other','Other',?)").run(stamp);
  insertMedia(sql, { id: "m1", sha: SHA_A });
  insertBlob(sql, { id: "b-a", sha: SHA_A });
  insertBlob(sql, { id: "b-a-other", sha: SHA_A, workspace: "ws-other", storageKey: "ws/ws-other/blobs/aa/other" });
  const { rows, projection } = await share(t, sql);
  assert.deepEqual(rows("asset_blobs").map(row => row.id), ["b-a"]);
});

test("an ordinary rendition may not reach document bytes whose only public-media owner is trashed", async t => {
  const { sql } = sourceDb(t);
  insertMedia(sql, { id: "m1", sha: SHA_A });
  insertMedia(sql, { id: "m-trashed", sha: SHA_B, status: "trashed" });
  insertDocument(sql, { id: "d1", sha: SHA_B });
  insertBlob(sql, { id: "b-b", sha: SHA_B });
  insertRendition(sql, { id: "forged", assetId: "m1", storageKey: blobKey(SHA_B), transform: "public" });
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), refusal("INVALID_DOCUMENT", "Ordinary rendition references a private document blob."));
});

test("slug history and renditions travel only with a retained owner; dropped keys are reported once", async t => {
  const { sql } = sourceDb(t);
  sql.pragma("foreign_keys = OFF");
  insertMedia(sql, { id: "m1", sha: SHA_A });
  insertBlob(sql, { id: "b-a", sha: SHA_A });
  sql.prepare("INSERT INTO media_slug_history (workspace_id,slug,media_id,retired_at) VALUES ('ws','old',?,?)").run("m1", stamp);
  sql.prepare("INSERT INTO media_slug_history (workspace_id,slug,media_id,retired_at) VALUES ('ws','gone',?,?)").run("missing", stamp);
  insertRendition(sql, { id: "r1", assetId: "m1", storageKey: "ws/ws/renditions/r1", transform: "thumb" });
  insertRendition(sql, { id: "r-orphan", assetId: "missing", storageKey: "ws/ws/renditions/orphan" });
  insertRendition(sql, { id: "r-orphan-2", assetId: "missing-too", storageKey: "ws/ws/renditions/orphan" });
  const { rows, projection } = await share(t, sql);
  assert.deepEqual(rows("media_slug_history").map(row => row.slug), ["old"]);
  assert.deepEqual(rows("asset_renditions").map(row => row.id), ["r1"]);
  assert.deepEqual(projection.media, [{ storageKey: blobKey(SHA_A), sha256: SHA_A }, { storageKey: "ws/ws/renditions/r1" }]);
});

test("an ordinary rendition pointing at a document-only blob refuses with INVALID_DOCUMENT", async t => {
  const { sql } = sourceDb(t);
  insertMedia(sql, { id: "m1", sha: SHA_A });
  insertDocument(sql, { id: "d1", sha: SHA_B });
  insertBlob(sql, { id: "b-b", sha: SHA_B });
  insertRendition(sql, { id: "forged", assetId: "m1", storageKey: blobKey(SHA_B), transform: "public" });
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), refusal("INVALID_DOCUMENT", "Ordinary rendition references a private document blob."));
});

test("an ordinary rendition may share bytes a document also owns when active public media owns them too", async t => {
  const { sql } = sourceDb(t);
  insertMedia(sql, { id: "m1", sha: SHA_B });
  insertDocument(sql, { id: "d1", sha: SHA_B });
  insertBlob(sql, { id: "b-b", sha: SHA_B });
  insertRendition(sql, { id: "r1", assetId: "m1", storageKey: blobKey(SHA_B), transform: "public" });
  const { rows } = await share(t, sql);
  assert.deepEqual(rows("asset_renditions").map(row => row.id), ["r1"]);
});

test("a document keeps only its original rendition", async t => {
  const { sql } = sourceDb(t);
  insertDocument(sql, { id: "d1", sha: SHA_B });
  insertBlob(sql, { id: "b-b", sha: SHA_B });
  insertRendition(sql, { id: "d1-original", assetId: "d1", storageKey: blobKey(SHA_B) });
  insertRendition(sql, { id: "d1-thumb", assetId: "d1", storageKey: "ws/ws/renditions/thumb", transform: "thumb" });
  const { rows, projection } = await share(t, sql);
  assert.deepEqual(rows("asset_renditions").map(row => row.id), ["d1-original"]);
  assert.deepEqual(projection.documents, [{ storageKey: blobKey(SHA_B), sha256: SHA_B, originalFilename: "d1.md" }]);
});

test("a document original rendition with a key other than its source blob refuses with INVALID_DOCUMENT", async t => {
  const { sql } = sourceDb(t);
  insertDocument(sql, { id: "d1", sha: SHA_B });
  insertBlob(sql, { id: "b-b", sha: SHA_B });
  insertRendition(sql, { id: "d1-original", assetId: "d1", storageKey: blobKey(SHA_A) });
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), refusal("INVALID_DOCUMENT", "Document original rendition has an invalid blob key."));
});

// ---------------------------------------------------------------- documentReferences

for (const [label, arrange] of [
  ["a non-hex source hash", (sql: Sql) => { insertDocument(sql, { id: "d1", sha: "not-a-hash" }); insertBlob(sql, { id: "b", sha: "not-a-hash" }); }],
  ["a missing source blob", (sql: Sql) => { insertDocument(sql, { id: "d1", sha: SHA_B }); insertMedia(sql, { id: "m1", sha: SHA_A }); insertBlob(sql, { id: "b", sha: SHA_A }); }],
  ["a source blob under another key", (sql: Sql) => { insertDocument(sql, { id: "d1", sha: SHA_B }); insertBlob(sql, { id: "b", sha: SHA_B, storageKey: "ws/ws/blobs/elsewhere" }); }],
  ["an inactive source blob", (sql: Sql) => { insertDocument(sql, { id: "d1", sha: SHA_B }); insertBlob(sql, { id: "b", sha: SHA_B, status: "tombstoned" }); }],
  ["no original filename", (sql: Sql) => { insertDocument(sql, { id: "d1", sha: SHA_B, originalFilename: null }); insertBlob(sql, { id: "b", sha: SHA_B }); }],
] as const) test(`a document with ${label} refuses with INVALID_DOCUMENT`, async t => {
  const { sql } = sourceDb(t);
  arrange(sql);
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), refusal("INVALID_DOCUMENT", DOCUMENT_REFUSAL));
});

test("a document whose filename has no allowed extension refuses through the document ingress rule", async t => {
  const { sql } = sourceDb(t);
  insertDocument(sql, { id: "d1", sha: SHA_B, originalFilename: "payload.exe" });
  insertBlob(sql, { id: "b", sha: SHA_B });
  await assert.rejects(sanitizeShareDatabase({ snapshot: sql.serialize() }), (error: unknown) => {
    assert.ok(error instanceof MediaValidationError, String(error));
    assert.match(error.message, /^document type must be \.\w+/);
    return true;
  });
});

test("S6: shared sites preserve published cookie-banner settings and the separate draft", async t => {
  const { sql } = sourceDb(t);
  const published = { ...SITE_CONSENT_DEFAULTS, enabled: true, privacyPolicyUrl: "/privacy", title: "Published cookie choices", policyVersion: "published-policy" };
  const draft = { ...published, enabled: false, title: "Draft cookie choices", policyVersion: "draft-policy" };
  const insert = sql.prepare("INSERT INTO site_consent_revisions (workspace_id,id,config_json,actor_id,created_at) VALUES ('ws',?,?,'owner',?)");
  insert.run("published-consent", JSON.stringify(published), stamp);
  insert.run("draft-consent", JSON.stringify(draft), stamp);
  sql.prepare("INSERT INTO site_consent_heads (workspace_id,draft_id,published_id) VALUES ('ws','draft-consent','published-consent')").run();

  const { rows } = await share(t, sql);
  assert.deepEqual(Object.fromEntries(rows("site_consent_revisions").map(row => [row.id, JSON.parse(String(row.config_json))])), {
    "published-consent": published,
    "draft-consent": draft,
  });
  assert.deepEqual(rows("site_consent_heads"), [{ workspace_id: "ws", draft_id: "draft-consent", published_id: "published-consent" }]);
});

// ---------------------------------------------------------------- copySettings

test("only active, non-secret, workspace-scoped, publishable definitions with a valid default travel verbatim", async t => {
  const { sql } = sourceDb(t);
  insertDefinition(sql, { id: "title", namespace: "core.site", key: "title", defaultJson: '"Default title"' });
  insertDefinition(sql, { id: "template", namespace: "site.seo", key: "title_template", defaultJson: '{"a":1}', schema: '{"type":"json"}' });
  insertDefinition(sql, { id: "global-only", namespace: "site.seo", key: "default_description", scopes: 1 });
  insertDefinition(sql, { id: "not-listed", namespace: "private", key: "credential" });
  insertDefinition(sql, { id: "secret-flag", namespace: "core.site", key: "title", secret: 1 });
  insertDefinition(sql, { id: "retired", namespace: "core.site", key: "title", status: "retired" });
  insertDefinition(sql, { id: "secret-shaped", namespace: "core.site", key: "title", defaultJson: JSON.stringify("ghp_" + "x".repeat(36)) });
  insertDefinition(sql, { id: "bad-default", namespace: "core.site", key: "title", defaultJson: "42" });
  const { rows } = await share(t, sql);
  assert.deepEqual(rows("setting_definitions").map(row => [row.setting_id, row.default_json]), [["title", '"Default title"'], ["template", '{"a":1}']]);
});

test("workspace values: valid and cleared values travel re-encoded as share; secret-shaped, invalid and stale-version values are omitted", async t => {
  const { sql } = sourceDb(t);
  insertDefinition(sql, { id: "title", namespace: "core.site", key: "title", schema: '{"type":"json"}', version: 2 });
  insertDefinition(sql, { id: "description", namespace: "site.seo", key: "default_description" });
  insertDefinition(sql, { id: "template", namespace: "site.seo", key: "title_template" });
  insertDefinition(sql, { id: "secret-def", namespace: "site.seo", key: "title_template", defaultJson: JSON.stringify("ghp_" + "y".repeat(36)) });
  insertValue(sql, { id: "title", valueJson: '{ "text" : "Portable" }', defVersion: 2 });
  insertValue(sql, { id: "description", valueJson: null, state: "cleared" });
  insertValue(sql, { id: "template", valueJson: JSON.stringify({ password: "ghp_" + "x".repeat(36) }) });
  insertDefinition(sql, { id: "invalid", namespace: "site.seo", key: "title_template" });
  insertValue(sql, { id: "invalid", valueJson: "42" });
  insertValue(sql, { id: "secret-def", valueJson: '"fine"' });
  insertDefinition(sql, { id: "stale", namespace: "site.seo", key: "title_template", version: 2 });
  insertValue(sql, { id: "stale", valueJson: '"stale"', defVersion: 1 });
  const { rows } = await share(t, sql);
  assert.deepEqual(rows("setting_values_workspace").map(row => [row.setting_id, row.value_json, row.state, row.def_version, row.updated_by]), [
    ["title", '{"text":"Portable"}', "set", 2, "share"],
    ["description", "null", "cleared", 1, "share"],
  ]);
});

// ---------------------------------------------------------------- prepareSharePluginTables

async function pluginTarget(t: TestContext) {
  const db = openContentDb({ filePath: ":memory:" });
  t.after(() => db.$client.close());
  return sqliteKernel<Record<string, Row>>(db);
}

test("plugin tables: present portable tables are built with only their policy columns; private names are always reported", async t => {
  const target = await pluginTarget(t);
  const before = new Set(await listTables(target));
  const modules = [
    fixtureModule([
      { name: "notes", columns: NOTES_COLUMNS, portability: { kind: "portable", columns: ["id", "body"] } },
      { name: "absent", columns: NOTES_COLUMNS, portability: { kind: "portable", columns: ["id"] } },
      { name: "secrets", columns: NOTES_COLUMNS, portability: { kind: "private" } },
      { name: "plain", columns: NOTES_COLUMNS },
    ]),
    fixtureModule([{ name: "audit", columns: NOTES_COLUMNS, portability: { kind: "private" } }], "privateonly"),
  ];
  const present = new Set(["p_fixture__notes", "p_fixture__secrets", "p_fixture__plain"]);
  const result = await prepareSharePluginTables({ target, present }, { modules });
  assert.deepEqual(result, { portable: new Set(["p_fixture__notes"]), private: new Set(["p_fixture__secrets", "p_privateonly__audit"]) });
  assert.deepEqual((await listTables(target)).filter(name => !before.has(name) && name.startsWith("p_")), ["p_fixture__notes"]);
  assert.deepEqual((await listColumns(target, "p_fixture__notes")).map(column => column.name), ["id", "body"]);
});

test("plugin tables: a portable policy naming an undeclared column refuses with UNSUPPORTED_SCHEMA", async t => {
  const target = await pluginTarget(t);
  const modules = [fixtureModule([{ name: "notes", columns: NOTES_COLUMNS, portability: { kind: "portable", columns: ["id", "missing"] } }])];
  await assert.rejects(prepareSharePluginTables({ target, present: new Set(["p_fixture__notes"]) }, { modules }), refusal("UNSUPPORTED_SCHEMA", "Invalid portable columns for 'p_fixture__notes': its portability policy names a column the table does not declare."));
});

test("plugin tables: a declaration the trusted DDL owner rejects refuses with UNSUPPORTED_SCHEMA and its reason", async t => {
  const target = await pluginTarget(t);
  const modules = [fixtureModule([{ name: "notes", columns: [{ name: "bad name", type: "TEXT" }], portability: { kind: "portable", columns: ["bad name"] } }])];
  await assert.rejects(prepareSharePluginTables({ target, present: new Set(["p_fixture__notes"]) }, { modules }), refusal("UNSUPPORTED_SCHEMA", "Cannot build portable plugin schema for 'fixture': invalid column name: bad name"));
});
