/** Approved Library step 6. Authored without execution per dispatch.
 * RED kinds are source-based expectations, never observed runs. Missing/corrupt bytes
 * already failed checksum checks; their document-specific errors are message-only.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import express from "express";
import { createHash } from "node:crypto";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { LocalFsBlobStore, computeBlobStorageKey, type BlobStorePort } from "../../media/index.js";
import { blobStoreFromObjectStore } from "@jini-ai/cms/media";
import { createDeployHostKit } from "../../deployments/deploy-targets/host-kit.js";
import { libraryFixture } from "../../media/__tests__/library.fixture.js";
import { contributeMediaPublish } from "../../media/publish-content.js";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { SqliteMediaRepo, SqliteAssetBlobRepo, SqliteAssetRenditionRepo } from "#src/platform/db/sqlite/media-repo.sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { sanitizeShareDatabase, rewriteArchiveMedia } from "#src/server/runtime/composition/site-portability";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { readTemplate } from "#src/platform/site-dir/read-template";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerMediaRenditionRoute, registerMediaOriginalVideoRoute } from "#src/server/inbound/public-http/routes/site/media-rendition";
import { registerAdminMediaListRoute } from "#src/server/inbound/admin-http/routes/media/list";
import type { MediaRenditionRouteDeps } from "#src/server/inbound/admin-http/routes/media/deps";
import { prepareShareContent } from "../share-preparation.js";
import { buildShareZip } from "../share-zip.js";
import { fixtureManifest } from "./archive.fixture.js";
import { buildZipFixture } from "../../agent-plugins/__tests__/fixtures/build-zip.js";
import { MAX_DOCUMENT_BYTES, validateDocumentIngress, registerTransform } from "../../media/index.js";
import { InMemoryPostRepo } from "../../post/index.js";
import { InMemoryMemberSessionRepo, InMemoryMemberSubscriptionRepo, InMemoryMemberTierRepo } from "../../members/index.js";
import { createDocumentArchiveReader } from "../../media/document-archive.js";
import { downloadDocuments } from "../../media/__tests__/download-documents.fixture.js";
import { importFixture, OWNER_PASSWORD, MEDIA, HASH, stamp } from "./import.fixture.js";

function addDocument(h: Awaited<ReturnType<typeof importFixture>>, id: string, bytes: Buffer, status = "active") {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = computeBlobStorageKey({ workspaceId: "ws", sha256 });
  h.db.$client.prepare("INSERT OR IGNORE INTO asset_blobs (id,workspace_id,sha256,storage_key,created_by_principal,created_at,status,document_owned) VALUES (?,'ws',?,?,'document-uploader',?,'active',1)").run(id + "-blob", sha256, storageKey, stamp);
  h.db.$client.prepare("INSERT INTO media (id,workspace_id,kind,original_filename,created_by,title,alt,caption,credit,source_sha256,status,created_at,updated_at,version) VALUES (?,'ws','document',?,'document-uploader','Renamed','','','',?,?,?,?,1)").run(id, id + ".md", sha256, status, stamp, stamp);
  h.db.$client.prepare("INSERT INTO media_slug_history (workspace_id,slug,media_id,retired_at) VALUES ('ws',?,?,?)").run(id + "-old", id, stamp);
  h.db.$client.prepare("INSERT INTO asset_renditions (id,workspace_id,asset_id,transform_name,version,storage_key,created_at) VALUES (?,'ws',?,'original',1,?,?)").run(id + "-original", id, storageKey, stamp);
  h.files.set("uploads/" + storageKey, bytes);
  return { sha256, storageKey };
}

async function sourceStore(t: TestContext, h: Awaited<ReturnType<typeof importFixture>>, kind: "local" | "s3"): Promise<BlobStorePort> {
  const objects = new Map([...h.files].filter(([name]) => name.startsWith("uploads/")).map(([name, bytes]) => [name.slice(8), bytes]));
  if (kind === "local") {
    const rootDir = path.join(h.root, "source-uploads");
    for (const [key, bytes] of objects) { fs.mkdirSync(path.dirname(path.join(rootDir, key)), { recursive: true }); fs.writeFileSync(path.join(rootDir, key), bytes); }
    return new LocalFsBlobStore({ rootDir });
  }
  // Exercise the bundled s3-compatible plugin's real signed object store (the provider media uses
  // under TOVU_MEDIA_BLOB_STORE=s3) through its HEAD/GET path with an isolated HTTP object service.
  const server = http.createServer((req, res) => {
    const bytes = objects.get(decodeURIComponent(new URL(req.url!, "http://localhost").pathname.slice("/bucket/".length)));
    if (!bytes) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Length": bytes.length }); res.end(req.method === "HEAD" ? undefined : bytes);
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const providerUrl = new URL("../../../../../../content/agent-plugins/s3-compatible/object-stores/s3-compatible.mjs", import.meta.url).href;
  const provider = (await import(providerUrl)).default;
  const created = provider.create({
    settings: { bucket: "bucket" },
    credential: { fields: { accessKeyId: "fixture", region: "us-east-1", endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}` }, secret: "fixture" },
    host: { createSigV4Client: createDeployHostKit({}).createSigV4Client },
  });
  assert.equal(created.status, "ok", JSON.stringify(created.error));
  return blobStoreFromObjectStore({ store: created.value });
}

for (const storage of ["local", "s3"] as const) test(`L3 ${storage}: share/import preserves private documents and deduplicates blobs`, async t => {
  const h = await importFixture(t);
  const bytes = Buffer.from("# Library original bytes\n");
  const doc = addDocument(h, "document", bytes);
  addDocument(h, "second-document", bytes);
  const downloads = await downloadDocuments({});
  for (const [ext, content] of Object.entries(downloads)) {
    addDocument(h, 'download-' + ext, content);
    h.db.$client.prepare("UPDATE media SET original_filename=? WHERE id=?").run('download.' + ext, 'download-' + ext);
  }
  const trashed = addDocument(h, "trashed-document", Buffer.from("Trash must never travel"), "trashed");
  // Same blob, different editorial kinds: retain both and the sticky privacy marker.
  addDocument(h, "shared-document", MEDIA);
  h.db.$client.prepare("UPDATE asset_blobs SET document_owned=1 WHERE sha256=?").run(HASH);
  const siteDir = path.join(h.root, "source");
  fs.mkdirSync(path.join(siteDir, "uploads/chat-attachments"), { recursive: true });
  fs.writeFileSync(path.join(siteDir, "uploads/chat-attachments/private.md"), "Temporary attachment");
  const plan = await prepareShareContent({ snapshotRoot: h.root, sources: { siteDir, mediaUploadsDir: path.join(siteDir, "uploads"), themesDir: path.join(siteDir, "themes"), skillsDir: path.join(siteDir, "skills"), agentPlugins: resolveAgentPluginLayout({ siteDir: siteDir }, { env: {} }), tovuVersion: "test" },
    blobStore: await sourceStore(t, h, storage), sanitize: sanitizeShareDatabase, rewriteMedia: rewriteArchiveMedia, imageTransformer: { transform: async () => assert.fail("not raster") },
    dbOps: { getCapabilities: async () => ({ restorePoint: { costClass: "cheap", kind: "file-snapshot" } }), captureRestorePoint: async () => {
      const artifactRef = path.join(h.root, "source-snapshot.db"); fs.writeFileSync(artifactRef, h.db.$client.serialize()); return { artifactRef, watermarkAtCapture: 1 };
    }, restoreFromArtifact: async () => { throw new Error("must never restore source"); } },
  });
  const paths = plan.bufferedFiles!.map(file => file.path);
  assert.equal(paths.filter(name => name.startsWith("media/")).length, plan.media!.length);
  assert.equal(paths.includes("uploads/" + trashed.storageKey), false);
  assert.equal(paths.some(name => name.includes("chat-attachments")), false);
  const exported = new Database(plan.database!.bytes);
  try {
    assert.equal(exported.prepare("SELECT 1 FROM media WHERE id='trashed-document'").get(), undefined);
    assert.equal(exported.prepare("SELECT 1 FROM media_slug_history WHERE media_id='trashed-document'").get(), undefined);
    assert.equal(exported.prepare("SELECT 1 FROM asset_renditions WHERE asset_id='trashed-document'").get(), undefined);
    assert.equal(exported.prepare("SELECT 1 FROM asset_blobs WHERE sha256=?").get(trashed.sha256), undefined);
    assert.deepEqual(exported.prepare("SELECT kind,original_filename,created_by,title,created_at FROM media WHERE id='document'").get(), { kind: "document", original_filename: "document.md", created_by: null, title: "Renamed", created_at: stamp });
    assert.deepEqual(exported.prepare("SELECT document_owned,created_by_principal FROM asset_blobs WHERE sha256=?").get(doc.sha256), { document_owned: 1, created_by_principal: "share" });
  } finally { exported.close(); }
  const archive = await buildShareZip({ plan, zip: zipFolderFiles });
  const upload = await h.backend.upload({ principalId: "recipient", archive });
  const pending = await h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } });
  await h.backend.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  const site = h.workspace.registry({}).list({})[0]!;
  const imported = openContentDb({ filePath: resolveSiteDatabasePaths({ dir: site.path }, { workspace: h.workspace }).contentDbPath });
  t.after(() => imported.$client.close());
  const workspaceId = readTemplate({ templateId: "starter" }).seed.workspace.id;
  const mediaRepo = new SqliteMediaRepo(imported), assetBlobRepo = new SqliteAssetBlobRepo(imported);
  const row = await mediaRepo.findById({ workspaceId, id: "document" });
  assert.equal(row?.kind, "document"); assert.equal(row?.originalFilename, "document.md"); assert.equal(row?.createdBy, undefined);
  assert.equal((await assetBlobRepo.findByHash({ workspaceId, sha256: doc.sha256 }))?.documentOwned, true);
  assert.equal((await assetBlobRepo.findByHash({ workspaceId, sha256: HASH }))?.documentOwned, true);
  const importedKey = computeBlobStorageKey({ workspaceId, sha256: doc.sha256 });
  assert.equal((await assetBlobRepo.findByHash({ workspaceId, sha256: doc.sha256 }))?.storageKey, importedKey);
  assert.deepEqual(fs.readFileSync(path.join(site.path, "uploads", importedKey)), bytes);
  assert.deepEqual(fs.readFileSync(path.join(site.path, "uploads", computeBlobStorageKey({ workspaceId, sha256: HASH }))), MEDIA);
  assert.equal((await sanitizeShareDatabase({ snapshot: imported.$client.serialize() })).documents?.length, 10, "imported documents can be shared again");
  for (const [ext, content] of Object.entries(downloads)) {
    const download = await mediaRepo.findById({ workspaceId, id: 'download-' + ext });
    assert.equal(download?.kind, 'document');
    assert.equal(download?.originalFilename, 'download.' + ext);
    assert.equal(download?.createdBy, undefined);
    const key = computeBlobStorageKey({ workspaceId, sha256: createHash('sha256').update(content).digest('hex') });
    assert.deepEqual(fs.readFileSync(path.join(site.path, 'uploads', key)), content);
  }
  assert.equal(fs.existsSync(path.join(site.path, "uploads", trashed.storageKey)), false);
  const { deps: defaults } = libraryFixture();
  const deps = { ...defaults, workspaceId, mediaRepo, assetBlobRepo, assetRenditionRepo: new SqliteAssetRenditionRepo(imported), blobStore: new LocalFsBlobStore({ rootDir: path.join(site.path, "uploads") }),
    postRepo: new InMemoryPostRepo(), memberSessionRepo: new InMemoryMemberSessionRepo(), memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo(), memberTierRepo: new InMemoryMemberTierRepo(),
  } satisfies MediaRenditionRouteDeps;
  const app = express(); app.use((_req, res, next) => { res.locals.principal = { id: "recipient" }; next(); });
  registerAdminMediaListRoute(app, deps);
  registerMediaRenditionRoute(app, deps); registerMediaOriginalVideoRoute(app, deps);
  const base = await startTestServer(app, t);
  const listed = await (await fetch(`${base}/api/admin/v1/workspaces/${workspaceId}/media`)).json();
  assert.equal(listed.media.some((item: { kind: string }) => item.kind === "document"), false);
  const library = await (await fetch(`${base}/api/admin/v1/workspaces/${workspaceId}/media?kind=document`)).json();
  assert.equal(library.media.length, 10);
  assert.ok(library.media.every((item: { publicUrl: string | null }) => item.publicUrl === null));
  assert.equal(library.media.find((item: { id: string }) => item.id === "document").byteSize, bytes.length);
  for (const suffix of ["original", "public.v1/document.png"]) {
    const response = await fetch(`${base}/m/document/${suffix}`); assert.equal(response.status, 404); assert.match(response.headers.get("cache-control")!, /no-store/);
  }
  const outbox = new InMemoryOutbox();
  const handler = contributeMediaPublish().build({ ...deps, outbox, changeSets: new InMemoryChangeSetRepo([], [], outbox), ports: { media: { repo: mediaRepo, assetBlobRepo, blobStore: deps.blobStore, contentTypeStore: deps.mediaContentTypeStore } } });
  const packed = []; for await (const item of handler.pack()) packed.push(item);
  assert.equal(packed.some(item => item.id === "document" || item.id === "second-document" || item.id === "shared-document"), false);
  assert.match((await handler.precheck({ entityType: "media", id: "document", schemaVersion: 1, hashVersion: 1, contentHash: "forged", requiredBlobs: [doc.sha256], state: { ...row } }))!, /documents cannot be published/i);
});

for (const variant of ["missing", "corrupt", "invalid-json", "invalid-docx", "bad-key"] as const) test(`L3 import explicitly rejects ${variant} document before creating a site`, async t => {
  const h = await importFixture(t);
  const bytes = Buffer.from("invalid JSON");
  const doc = addDocument(h, "document", bytes);
  if (variant === "missing") h.files.delete("uploads/" + doc.storageKey);
  if (variant === "corrupt") h.files.set("uploads/" + doc.storageKey, Buffer.from("different bytes"));
  if (variant === "invalid-json") h.db.$client.prepare("UPDATE media SET original_filename='document.json' WHERE id='document'").run();
  if (variant === "invalid-docx") h.db.$client.prepare("UPDATE media SET original_filename='document.docx' WHERE id='document'").run();
  if (variant === "bad-key") h.db.$client.prepare("UPDATE asset_blobs SET storage_key='chat-attachments/private.md' WHERE sha256=?").run(doc.sha256);
  // Recompute the outer inventory so these reach the DB/blob policy rather than ZIP checksums.
  const archive = await h.archiveWithDatabase(h.db.$client.serialize());
  const upload = await h.backend.upload({ principalId: "recipient", archive });
  await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } }), /document|database/i);
  assert.deepEqual(h.workspace.registry({}).list({}), []); assert.deepEqual(h.started, []);
  assert.equal(fs.readdirSync(h.registry.directory).some(name => name.endsWith(".stage")), false);
});

test("L3 a v1 archive is refused without creating a site", async t => {
  const h = await importFixture(t);
  const archive = await buildZipFixture([{ path: "tovu-backup.json", content: JSON.stringify({ formatVersion: 1 }) }]);
  const upload = await h.backend.upload({ principalId: "recipient", archive });
  await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } }), /manifest/);
  assert.deepEqual(h.workspace.registry({}).list({}), []);
});

for (const status of ["active", "trashed"]) test(`L3 document-first deduplication strips mixed blob uploader attribution (${status})`, async t => {
  const h = await importFixture(t);
  const doc = addDocument(h, "first-document", Buffer.from("Document uploaded before ordinary media"), status);
  h.db.$client.prepare("UPDATE media SET source_sha256=? WHERE id='media'").run(doc.sha256);
  const projection = await sanitizeShareDatabase({ snapshot: h.db.$client.serialize() });
  const exported = new Database(projection.bytes);
  try {
    assert.deepEqual(exported.prepare("SELECT kind FROM media WHERE id='media'").get(), { kind: "media" });
    assert.deepEqual(exported.prepare("SELECT created_by_principal,document_owned FROM asset_blobs WHERE sha256=?").get(doc.sha256),
      { created_by_principal: "share", document_owned: 1 });
    assert.equal(projection.bytes.includes(Buffer.from("document-uploader")), false);
  } finally { exported.close(); }
});

for (const schema of [{ index: 13, tag: "0013_unify_vault_credentials" }, { index: 14, tag: "0014_media_library" }]) test(`L3 rejects invented manifest identity ${schema.index}`, async t => {
  const h = await importFixture(t);
  const files = new Map(h.plan.bufferedFiles!.map(file => [file.path, file.content]));
  files.set("content.db", h.plan.database!.bytes);
  const archive = await buildZipFixture([
    ...[...files].map(([path, content]) => ({ path, content })),
    { path: "manifest.json", content: fixtureManifest({ plan: { ...h.plan, schema }, files }) },
  ]);
  const upload = await h.backend.upload({ principalId: "recipient", archive });
  await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } }), /schema identity/);
  assert.deepEqual(h.workspace.registry({}).list({}), []); assert.deepEqual(h.started, []);
});

test("L3 forged ordinary rendition cannot expose a private document through anonymous media retrieval", async t => {
  const h = await importFixture(t);
  const bytes = Buffer.from("Private document must never be publicly retrieved");
  const doc = addDocument(h, "private-document", bytes);
  h.db.$client.prepare("INSERT INTO asset_renditions (id,workspace_id,asset_id,transform_name,version,storage_key,created_at) VALUES ('forged','ws','media','public',1,?,?)").run(doc.storageKey, stamp);
  const archive = await h.archiveWithDatabase(h.db.$client.serialize());
  const upload = await h.backend.upload({ principalId: "recipient", archive });
  let pending;
  try { pending = await h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } }); }
  catch (error) {
    assert.equal((error as { code: string }).code, "INVALID_DATABASE");
    assert.deepEqual(h.workspace.registry({}).list({}), []);
    assert.deepEqual(h.started, []);
    return;
  }
  // Regression probe: if admission ever succeeds, exercise the actual anonymous URL through
  // the ordinary asset ID, where checking only the document's own public URL misses the leak.
  await h.backend.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  const site = h.workspace.registry({}).list({})[0]!;
  const imported = openContentDb({ filePath: resolveSiteDatabasePaths({ dir: site.path }, { workspace: h.workspace }).contentDbPath });
  t.after(() => imported.$client.close());
  const { deps: defaults } = libraryFixture();
  const app = express();
  const workspaceId = readTemplate({ templateId: "starter" }).seed.workspace.id;
  await registerTransform({ deps: { transformRepo: defaults.transformDefinitionRepo, clock: defaults.clock, idGen: defaults.idGen },
    input: { workspaceId, name: "public", params: { format: "png" }, owner: "core" } });
  registerMediaRenditionRoute(app, { ...defaults, workspaceId, postRepo: new InMemoryPostRepo(),
    memberSessionRepo: new InMemoryMemberSessionRepo(), memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo(), memberTierRepo: new InMemoryMemberTierRepo(),
    mediaRepo: new SqliteMediaRepo(imported), assetBlobRepo: new SqliteAssetBlobRepo(imported), assetRenditionRepo: new SqliteAssetRenditionRepo(imported),
    blobStore: new LocalFsBlobStore({ rootDir: path.join(site.path, "uploads") }) } satisfies MediaRenditionRouteDeps);
  const response = await fetch(`${await startTestServer(app, t)}/m/media/public.v1/image.txt`);
  assert.equal(response.status, 404);
  assert.equal(Buffer.from(await response.arrayBuffer()).includes(bytes), false);
  assert.fail("Forged ordinary rendition must be rejected before staging");
});

test("L3 genuine pre-L3 share omits Trash and orphan payloads but rejects arbitrary uploads", async t => {
  const h = await importFixture(t);
  // Pre-L3 exports retained every blob/rendition, including trashed documents and orphans.
  // The manifest identity was already Drizzle 77; these are real historical columns/rows.
  const trash = addDocument(h, "old-trash", Buffer.from("Historical Trash bytes"), "trashed");
  const orphan = addDocument(h, "old-orphan", Buffer.from("Historical orphan bytes"));
  h.db.$client.prepare("DELETE FROM asset_renditions WHERE asset_id='old-orphan'").run();
  h.db.$client.prepare("DELETE FROM media_slug_history WHERE media_id='old-orphan'").run();
  h.db.$client.prepare("DELETE FROM media WHERE id='old-orphan'").run();
  const archive = await h.archiveWithDatabase(h.db.$client.serialize());
  const upload = await h.backend.upload({ principalId: "recipient", archive });
  const pending = await h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } });
  const stage = h.registry.stagePath(pending);
  for (const key of [trash.storageKey, orphan.storageKey]) assert.equal(fs.existsSync(path.join(stage, "uploads", key)), false);
  const staged = new Database(path.join(stage, "database/content.db"), { readonly: true });
  try {
    assert.equal(staged.prepare("SELECT 1 FROM media WHERE kind='document'").get(), undefined);
    assert.deepEqual(staged.prepare("SELECT sha256 FROM asset_blobs").all(), [{ sha256: HASH }]);
  } finally { staged.close(); }
  // v2 archives carry media only under media/ with a manifest record; a raw uploads/ entry is unlisted.
  const unlisted = new Map([["uploads/unlisted-owner.txt", Buffer.from("No database owner")]]);
  const extra = await h.backend.upload({ principalId: "recipient", archive: await h.archiveWithDatabase(h.db.$client.serialize(), { unlisted }) });
  await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: extra.uploadId } }), /ZIP inventory differs from the manifest/);
});

test("L3 valid DOCX package expansion is bounded within entry limits", async t => {
  const h = await importFixture(t);
  const members = [
    { path: "[Content_Types].xml", content: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { path: "_rels/.rels", content: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { path: "word/document.xml", content: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>' },
  ];
  const archiveReader = createDocumentArchiveReader({});
  await validateDocumentIngress({ filename: "valid.docx", bytes: await buildZipFixture(members) }, { archiveReader });
  // Six entries, each under 15 MiB, with valid package markers and >40 MiB total expansion.
  const padding = "<padding>" + "A".repeat(14 * 1024 * 1024) + "</padding>";
  const bytes = await buildZipFixture([...members, ...[1, 2, 3].map(index => ({ path: `word/padding${index}.xml`, content: padding }))]);
  assert.ok(bytes.length < MAX_DOCUMENT_BYTES);
  let entries = 0, expanded = 0;
  for await (const entry of archiveReader.entries({ archive: bytes })) {
    entries++; expanded += entry.declaredSize!;
    assert.ok(entry.declaredSize! < 15 * 1024 * 1024);
  }
  assert.equal(entries, 6); assert.ok(expanded > 40 * 1024 * 1024);
  addDocument(h, "expanding", bytes);
  h.db.$client.prepare("UPDATE media SET original_filename='expanding.docx' WHERE id='expanding'").run();
  const upload = await h.backend.upload({ principalId: "recipient", archive: await h.archiveWithDatabase(h.db.$client.serialize()) });
  await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } }), /DOCX expanded size|DOCX compression ratio/);
  assert.deepEqual(h.workspace.registry({}).list({}), []); assert.deepEqual(h.started, []);
});

for (const variant of ["oversize", "wrong-signature", "secret-sentinel", "destination-collision", "forged-cross-owner"] as const) test(`L3 isolated guard: ${variant}`, async t => {
  const h = await importFixture(t);
  const bytes = variant === "oversize" ? Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 65)
    : variant === "secret-sentinel" ? Buffer.from("Document secret: ghp_" + "x".repeat(36)) : Buffer.from("Valid private text");
  const doc = addDocument(h, "guarded", bytes);
  const errors = {
    oversize: /10 MiB/, "wrong-signature": /PDF signature/, "secret-sentinel": /credential-shaped/,
    // v2 carries no rendition bytes, so the forged rendition's recipient key fails its hash before any destination move.
    "destination-collision": /Referenced media is missing or failed its hash/, "forged-cross-owner": /database/i,
  };
  if (variant === "wrong-signature") h.db.$client.prepare("UPDATE media SET original_filename='guarded.pdf' WHERE id='guarded'").run();
  if (variant === "destination-collision") {
    const destination = computeBlobStorageKey({ workspaceId: readTemplate({ templateId: "starter" }).seed.workspace.id, sha256: doc.sha256 });
    // A legitimate ordinary rendition claims the future recipient key with different bytes.
    h.db.$client.prepare("INSERT INTO asset_renditions (id,workspace_id,asset_id,transform_name,version,storage_key,created_at) VALUES ('collision','ws','media','public',1,?,?)").run(destination, stamp);
    h.files.set("uploads/" + destination, Buffer.from("Different ordinary rendition bytes"));
  }
  if (variant === "forged-cross-owner") {
    const other = addDocument(h, "other-owner", Buffer.from("Other owner's private bytes"));
    h.db.$client.prepare("UPDATE asset_renditions SET storage_key=? WHERE asset_id='guarded'").run(other.storageKey);
  }
  const upload = await h.backend.upload({ principalId: "recipient", archive: await h.archiveWithDatabase(h.db.$client.serialize()) });
  await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } }), errors[variant]);
  assert.deepEqual(h.workspace.registry({}).list({}), []); assert.deepEqual(h.started, []);
  assert.equal(fs.readdirSync(h.registry.directory).some(name => name.endsWith(".stage")), false);
});
