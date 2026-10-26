/** Pins the export/import refusal paths not covered elsewhere: revoke edge cases, corrupt
 * uploads, undeclared bundled plugin tables (store/lipay) and publish-history privacy.
 * Covered elsewhere (not repeated here): path traversal/aliases/bombs/caps in
 * import-malicious; hostile accounts/sessions/secrets rows in import-private-rows;
 * the happy revoke path in share.integration and share-delivery.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { SiteShareRegistry, newShareIdentity } from "../share-registry.js";
import { createSiteShare, receiveSiteShareArtifact, revokeSiteShare, type ShareDelivery } from "../share-service.js";
import { sanitizeShareDatabase } from "../../../platform/db/sqlite/share-database.js";
import { FIRST_PARTY_DATA_MODULES } from "../../plugins/data-modules.js";
import { declareDataModule } from "../../plugins/data-module.js";
import { importFixture, stamp } from "./import.fixture.js";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { createSiteShareBackend } from "../share-backend.js";
import { resolveShareDelivery, createRuntimeShareDelivery } from "../share-hosting.js";
import { buildShareZip } from "../share-zip.js";
import { fileIdentity } from "../sources.js";
import { SHARE_LIMITS, checkShareLimits } from "../share-policy.js";
import type { SiteSharePlanContent } from "../plan-store.js";
import { claimSharePath, excludedSharePath, requireShareSecretFree, validateSharePath } from "../share-file-policy.js";


async function shareRegistry(t: import("node:test").TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), "share-refusals-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new SiteShareRegistry({ directory });
}

function fakeRemote(state: { present: boolean; deletes: number }): ShareDelivery {
  return {
    provider: "example-store", binding: "bucket-a",
    store: {
      upload: async () => ({ url: "https://bucket.example.test/x" }),
      delete: async () => { state.deletes++; state.present = false; },
      verify: async ({ present }: { present: boolean }) => state.present === present,
    } as unknown as ShareDelivery["store"],
  };
}

test("revoke: unknown or another site's shareId is NOT_FOUND and leaves the other site's export live", async t => {
  const registry = await shareRegistry(t);
  const other = await createSiteShare({ registry, site: "other-site", name: "site", archive: Buffer.from("PK other") });
  await assert.rejects(revokeSiteShare({ registry, site: "ws", shareId: "00000000-0000-4000-8000-000000000000" }), { code: "NOT_FOUND" });
  await assert.rejects(revokeSiteShare({ registry, site: "ws", shareId: other.shareId }), { code: "NOT_FOUND" });
  assert.equal((await registry.findToken({ token: other.token, file: other.file }))?.shareId, other.shareId);
  assert.deepEqual(await readFile(registry.artifactPath({ shareId: other.shareId })), Buffer.from("PK other"));
});

test("revoke twice is idempotent: same revokedAt, token stays dead, no error", async t => {
  const registry = await shareRegistry(t);
  const row = await createSiteShare({ registry, site: "ws", name: "site", archive: Buffer.from("PK fixture") });
  const first = await revokeSiteShare({ registry, site: "ws", shareId: row.shareId });
  const second = await revokeSiteShare({ registry, site: "ws", shareId: row.shareId });
  assert.equal(first.status, "revoked");
  assert.equal(second.status, "revoked");
  assert.equal(second.revokedAt, first.revokedAt);
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null);
  assert.equal((await registry.list({ site: "ws" })).length, 1);
});

test("revoke of a remote export disables the link first; without its original storage it fails, then a retry deletes and verifies", async t => {
  const registry = await shareRegistry(t);
  const remote = { present: true, deletes: 0 };
  const row = await createSiteShare({ registry, site: "ws", name: "site", archive: Buffer.from("PK remote") });
  await registry.put({ record: { ...row, url: "https://bucket.example.test/x", storage: { provider: "example-store", binding: "bucket-a", key: "k" } } });
  await assert.rejects(revokeSiteShare({ registry, site: "ws", shareId: row.shareId }), { code: "DELETE_FAILED", message: /configure its original storage/ });
  await assert.rejects(revokeSiteShare({ registry, site: "ws", shareId: row.shareId }, { delivery: { ...fakeRemote(remote), binding: "bucket-b" } }), { code: "DELETE_FAILED" });
  assert.equal(remote.deletes, 0, "a changed default bucket must never be asked to delete");
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null, "the public link is dead even though remote cleanup failed");
  assert.equal((await registry.get({ shareId: row.shareId }))?.status, "revoked");
  const done = await revokeSiteShare({ registry, site: "ws", shareId: row.shareId }, { delivery: fakeRemote(remote) });
  assert.equal(done.status, "revoked");
  assert.deepEqual(remote, { present: false, deletes: 1 });
});

test("revoke reports DELETE_FAILED when the remote copy is still reachable after delete", async t => {
  const registry = await shareRegistry(t);
  const row = await createSiteShare({ registry, site: "ws", name: "site", archive: Buffer.from("PK remote") });
  await registry.put({ record: { ...row, url: "https://bucket.example.test/x", storage: { provider: "example-store", binding: "bucket-a", key: "k" } } });
  const sticky = fakeRemote({ present: true, deletes: 0 });
  const delivery = { ...sticky, store: { ...sticky.store, delete: async () => {} } } as ShareDelivery;
  await assert.rejects(revokeSiteShare({ registry, site: "ws", shareId: row.shareId }, { delivery }), { code: "DELETE_FAILED", message: /not verified/ });
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null);
});

test("import refuses corrupt uploads (not a ZIP, truncated, empty) without registering or staging a site", async t => {
  const h = await importFixture(t);
  for (const [label, archive] of [
    ["not a zip", Buffer.from("<html>not a zip</html>")],
    ["truncated", h.archive.subarray(0, Math.floor(h.archive.length / 2))],
    ["central directory only", h.archive.subarray(h.archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])))],
    ["empty", Buffer.alloc(0)],
  ] as const) await t.test(label, async () => {
    // Refusing at upload is equally safe, but it must be a coded refusal, not a crash.
    const upload = await h.backend.upload({ principalId: "recipient", archive }).catch((error: unknown) => error);
    if (upload instanceof Error) assert.equal(typeof (upload as { code?: unknown }).code, "string", String(upload));
    else await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: (upload as { uploadId: string }).uploadId } }));
    assert.deepEqual(h.workspace.registry({}).list({}), []);
    assert.deepEqual(fs.readdirSync(path.join(h.root, "sites")).filter(name => !name.startsWith(".")), []);
    assert.equal(fs.existsSync(h.registry.directory) && fs.readdirSync(h.registry.directory).some(name => name.endsWith(".stage")), false);
  });
});

for (const [pluginId, table, columns] of [
  ["store", "products", ["id", "title", "price", "stock", "version"]],
  ["lipay", "payments", null],
] as const) test(`export of populated undeclared ${pluginId} tables refuses by name with a clear next step; empty ones do not block`, async t => {
  const h = await importFixture(t);
  const decl = FIRST_PARTY_DATA_MODULES.find(module => module.pluginId === pluginId)!;
  assert.ok(decl.tables.every(entry => entry.portability === undefined), `${pluginId} gained a portability policy; update this pin`);
  const result = await declareDataModule({ db: h.db, dbPath: ":memory:", decl });
  assert.equal(result.ok, true, result.error?.message);
  await sanitizeShareDatabase({ snapshot: h.db.$client.serialize() });
  const name = `p_${pluginId}__${table}`;
  const tableDecl = decl.tables.find(entry => entry.name === table)!;
  const names = columns ?? tableDecl.columns.filter(column => column.notNull || column.primaryKey).map(column => column.name);
  const values = names.map(column => tableDecl.columns.find(entry => entry.name === column)!.type === "INTEGER" ? 1 : "private-" + column);
  h.db.$client.prepare(`INSERT INTO "${name}" (${names.map(column => `"${column}"`).join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...values);
  await assert.rejects(sanitizeShareDatabase({ snapshot: h.db.$client.serialize() }), (error: unknown) => {
    assert.equal((error as { code: string }).code, "UNSUPPORTED_DATA");
    assert.match((error as Error).message, new RegExp(`'${name}'.*portable-data policy`));
    return true;
  });
  // The same rows forged into an archive must not reach a new site either.
  const upload = await h.backend.upload({ principalId: "recipient", archive: await h.archiveWithDatabase(h.db.$client.serialize()) });
  await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } }), /schema|database/i);
  assert.deepEqual(h.workspace.registry({}).list({}), []);
});

test("export leaves the source's publish history destinations untouched and never carries them", async t => {
  const h = await importFixture(t);
  h.db.$client.prepare("INSERT INTO publish_history (workspace_id,target,url,reachable,status,project_name,credential_id,config_fields_json,kind,published_at,triggered_by) VALUES ('ws','vercel','https://source.example.test',1,'live','source-project','cred-sentinel','{\"team\":\"source-team\"}','static',?,'admin_ui')").run(stamp);
  const before = h.db.$client.prepare("SELECT * FROM publish_history").all();
  const { archive } = await h.prepareProductionShare();
  assert.deepEqual(h.db.$client.prepare("SELECT * FROM publish_history").all(), before);
  const { reader } = await import("./import.fixture.js");
  let checked = false;
  for await (const entry of reader.entries({ archive })) {
    if (entry.kind !== "file" || entry.entryPath !== "database/content.db") continue;
    const chunks: Buffer[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    for (const sentinel of ["cred-sentinel", "source-team", "source.example.test", "source-project"]) assert.equal(bytes.includes(Buffer.from(sentinel)), false, sentinel);
    const projected = new Database(bytes, { readonly: true });
    try { assert.equal((projected.prepare("SELECT count(*) AS n FROM publish_history").get() as { n: number }).n, 0); }
    finally { projected.close(); }
    checked = true;
  }
  assert.equal(checked, true);
});

const archive = Buffer.from("PK test artifact");
const input = { site: "ws", name: "site", archive };
function delivery(overrides: Partial<ShareDelivery["store"]> = {}): ShareDelivery {
  return { provider: "example-store", binding: "bucket", store: { upload: async () => ({ url: "https://bucket.example/site.zip" }), delete: async () => {}, verify: async () => true, ...overrides } };
}
function plan(): SiteSharePlanContent {
  return { profile: "share", target: { kind: "zip" }, include: { database: true, media: true, themes: true, plugins: true, settings: true },
    database: { bytes: Buffer.from("safe projected DB"), watermarkAtCapture: 5 }, files: [], bufferedFiles: [], skipped: [], scopeNotes: {}, totalBytes: 17,
    site: { name: "Site", folderName: "site" }, schema: { index: 1, tag: "one" }, tovuVersion: "test", createdAt: "2026-10-19T00:00:00Z" };
}

test("receiver rejects unsafe filenames before reserving a token", async t => {
  const r = await shareRegistry(t);
  await assert.rejects(receiveSiteShareArtifact({ registry: r, site: "ws", token: "a".repeat(64), file: "../site.zip", archive }), { code: "INVALID_INPUT" });
  assert.deepEqual(fs.readdirSync(r.directory), []);
});
for (const operation of ["writeArtifact", "put"] as const) {
  test(`receiver compensates ${operation} failure without making a token public`, async t => {
    const r = await shareRegistry(t), failure = new Error(operation + " failed");
    t.mock.method(r, operation, async () => { throw failure; });
    const token = "a".repeat(64);
    await assert.rejects(receiveSiteShareArtifact({ registry: r, site: "ws", token, file: "site.tovu.zip", archive }), error => error === failure);
    assert.equal(await r.findToken({ token, file: "site.tovu.zip" }), null);
    assert.deepEqual(fs.readdirSync(r.directory), [token + ".token"]);
  });
}
test("cancelled export disables and deletes the local artifact before delivery", async t => {
  const r = await shareRegistry(t);
  await assert.rejects(createSiteShare({ registry: r, ...input }, { signal: AbortSignal.abort(), delivery: delivery({ upload: async () => assert.fail("cancelled export must not upload") }) }), { code: "CANCELLED" });
  const [row] = await r.list({});
  assert.equal(row?.status, "revoked");
  assert.equal(fs.existsSync(r.artifactPath(row!)), false);
  assert.equal(await r.findToken(row!), null);
});
for (const cleanup of ["delete throws", "purge unverified"] as const) {
  test(`failed delivery retains a retryable locator when ${cleanup}`, async t => {
    const r = await shareRegistry(t), events: unknown[] = [];
    const remote = delivery({
      upload: async ({ key, bytes, headers }) => { events.push({ key, bytes, headers }); return { url: "https://bucket.example/site.zip" }; },
      verify: async request => { events.push(request); return false; },
      delete: async request => { events.push(request); if (cleanup === "delete throws") throw new Error("offline"); },
    });
    await assert.rejects(createSiteShare({ registry: r, ...input }, { delivery: remote }), { code: "DELIVERY_CLEANUP_FAILED" });
    const [row] = await r.list({ site: "ws" });
    assert.equal(row?.status, "failed");
    assert.equal(row?.url, null);
    assert.equal(row?.storage?.url, "https://bucket.example/site.zip");
    assert.equal(row?.storage?.binding, "bucket");
    assert.equal(await r.findToken(row!), null);
    assert.deepEqual(fs.readFileSync(r.artifactPath(row!)), archive, "owner can still download the failed export");
    assert.deepEqual(events[1], { key: row!.storage!.key, url: "https://bucket.example/site.zip", present: true, bytes: archive.length });
    assert.deepEqual(events[2], { key: row!.storage!.key });
    if (cleanup === "purge unverified") assert.deepEqual(events[3], { key: row!.storage!.key, url: "https://bucket.example/site.zip", present: false });
  });
}
test("upload exception without a URL becomes a safe delivery refusal and still deletes remote bytes", async t => {
  const r = await shareRegistry(t), deleted: string[] = [];
  await assert.rejects(createSiteShare({ registry: r, ...input }, { delivery: delivery({ upload: async () => { throw new Error("SECRET backend detail"); }, delete: async ({ key }) => { deleted.push(key); }, verify: async () => assert.fail("no URL to verify") }) }), { code: "DELIVERY_FAILED", message: /Download the ZIP/ });
  const [row] = await r.list({});
  assert.equal(row?.status, "failed");
  assert.equal(row?.storage?.url, undefined);
  assert.deepEqual(deleted, [row!.storage!.key]);
});
test("a concurrent revoke during upload cannot publish a working token", async t => {
  const r = await shareRegistry(t);
  await assert.rejects(createSiteShare({ registry: r, ...input }, { delivery: delivery({ verify: async ({ present }) => {
    if (present) { const [row] = await r.list({}); await r.disable({ shareId: row!.shareId, site: "ws" }); }
    return true;
  } }) }), { code: "REVOKED" });
  const [row] = await r.list({});
  assert.equal(row?.status, "revoked");
  assert.equal(await r.findToken(row!), null);
});
test("failed local-runtime verification never remotely deletes through its own registry", async t => {
  const r = await shareRegistry(t);
  await assert.rejects(createSiteShare({ registry: r, ...input }, { delivery: { provider: "tovu-server", binding: r.directory, store: delivery({ verify: async () => false, delete: async () => assert.fail("local receiver must not delete itself") }).store } }), { code: "DELIVERY_FAILED" });
  assert.equal((await r.list({}))[0]?.status, "failed");
});
test("revoke preserves the tombstone if deleting the local ZIP fails, and retry completes", async t => {
  const r = await shareRegistry(t), row = await createSiteShare({ registry: r, ...input });
  const fault = t.mock.method(r, "deleteArtifact", async () => { throw new Error("disk failure"); });
  await assert.rejects(revokeSiteShare({ registry: r, site: "ws", shareId: row.shareId }), { code: "DELETE_FAILED", message: /token is disabled/ });
  assert.equal(await r.findToken(row), null);
  assert.equal((await r.get(row))?.status, "revoked");
  fault.mock.restore();
  assert.equal((await revokeSiteShare({ registry: r, site: "ws", shareId: row.shareId })).status, "revoked");
  assert.equal(fs.existsSync(r.artifactPath(row)), false);
});
test("revoke checks provider as well as binding and skips URL verification when none was uploaded", async t => {
  const r = await shareRegistry(t), row = await createSiteShare({ registry: r, ...input });
  await r.put({ record: { ...row, storage: { provider: "example-store", binding: "bucket", key: "saved-key" } } });
  await assert.rejects(revokeSiteShare({ registry: r, site: "ws", shareId: row.shareId }, { delivery: { ...delivery(), provider: "other" } }), { code: "DELETE_FAILED" });
  const deletes: string[] = [];
  await revokeSiteShare({ registry: r, site: "ws", shareId: row.shareId }, { delivery: delivery({ delete: async ({ key }) => { deletes.push(key); }, verify: async () => assert.fail("no URL exists") }) });
  assert.deepEqual(deletes, ["saved-key"]);
});

test("registry validates identifiers, preserves immutable claims, scopes history and sorts newest first", async t => {
  const r = await shareRegistry(t);
  assert.deepEqual(await new SiteShareRegistry({ directory: path.join(r.directory, "missing") }).list({}), []);
  assert.throws(() => r.artifactPath({ shareId: "../outside" }), { code: "INVALID_INPUT" });
  await assert.rejects(r.reserveToken({ token: "bad", shareId: newShareIdentity({}).shareId }), { code: "INVALID_INPUT" });
  assert.equal(await r.findToken({ token: "bad", file: "site.tovu.zip" }), null);
  assert.equal(await r.findToken({ token: "a".repeat(64), file: "bad" }), null);
  assert.equal(await r.findToken({ token: "a".repeat(64), file: "site.tovu.zip" }), null);
  assert.equal(await r.get({ shareId: newShareIdentity({}).shareId }), null);
  assert.equal(await r.disable({ shareId: newShareIdentity({}).shareId, site: "ws" }), null);
  const first = await createSiteShare({ registry: r, ...input, name: " 中文 " });
  assert.equal(first.file, "site.tovu.zip");
  const second = await createSiteShare({ registry: r, ...input, site: "other", name: "-My Site-" });
  assert.equal(second.file, "my-site.tovu.zip");
  await r.put({ record: { ...first, createdAt: "2020-01-01" } });
  await r.put({ record: { ...second, createdAt: "2021-01-01" } });
  fs.writeFileSync(path.join(r.directory, "junk.json"), "ignored");
  assert.deepEqual((await r.list({})).map(row => row.shareId), [second.shareId, first.shareId]);
  assert.deepEqual((await r.list({ site: "ws" })).map(row => row.shareId), [first.shareId]);
  assert.equal(await r.get({ shareId: first.shareId, site: "other" }), null);
  await r.reserveToken(first); // Same claim is idempotent.
  await assert.rejects(r.reserveToken({ token: first.token, shareId: second.shareId }), { code: "TOKEN_EXISTS" });
  await r.disable({ shareId: first.shareId, site: "ws" });
  await r.put({ record: first }); // A delayed writer cannot undo a permanent tombstone.
  assert.equal((await r.get(first))?.status, "revoked");
  assert.equal(await r.findToken(first), null);
});
test("registry does not hide corrupt metadata or filesystem failures as a missing export", async t => {
  const r = await shareRegistry(t), row = await createSiteShare({ registry: r, ...input });
  fs.writeFileSync(path.join(r.directory, row.shareId + ".json"), "{");
  await assert.rejects(r.get(row), SyntaxError);
  await assert.rejects(r.list({}), SyntaxError);
  fs.rmSync(path.join(r.directory, row.shareId + ".json"));
  fs.mkdirSync(path.join(r.directory, row.token + ".token-dir"));
  fs.rmSync(path.join(r.directory, row.token + ".token"));
  fs.renameSync(path.join(r.directory, row.token + ".token-dir"), path.join(r.directory, row.token + ".token"));
  await assert.rejects(r.findToken(row), { code: "EISDIR" });
  fs.mkdirSync(path.join(r.directory, "not-a-file.tovu.zip"));
  const id = newShareIdentity({}).shareId;
  fs.mkdirSync(r.artifactPath({ shareId: id }));
  // unlink() on a directory is EISDIR on Linux but EPERM on macOS (and Windows); either proves the
  // failure surfaces instead of being reported as a missing export.
  await assert.rejects(r.deleteArtifact({ shareId: id }), (error: NodeJS.ErrnoException) => error.code === "EISDIR" || error.code === "EPERM");
});

test("backend refuses unknown jobs and concurrent exports, resumes only for the same principal", async t => {
  const r = await shareRegistry(t);
  let release!: (value: SiteSharePlanContent) => void;
  const ready = new Promise<SiteSharePlanContent>(resolve => { release = resolve; });
  const backend = createSiteShareBackend({ registry: r, site: "space /site", prepare: async () => ready, zip: zipFolderFiles, delivery: async () => undefined });
  const signal = new AbortController().signal;
  await assert.rejects(backend.create({ principalId: "owner", jobId: newShareIdentity({}).shareId, signal }), { code: "JOB_NOT_FOUND" });
  const pending = await backend.create({ principalId: "owner", signal }, { waitMs: 0 }) as { jobId: string; phase: string };
  assert.equal(pending.phase, "preparing");
  await assert.rejects(backend.create({ principalId: "other", signal }), { code: "BUSY" });
  await assert.rejects(backend.create({ principalId: "other", jobId: pending.jobId, signal }), { code: "JOB_NOT_FOUND" });
  release(plan());
  const completed = await backend.create({ principalId: "owner", jobId: pending.jobId, signal }, { waitMs: 1000 }) as Record<string, unknown>;
  assert.equal(completed.status, "active");
  assert.equal(completed.token, undefined);
  assert.equal(completed.storage, undefined);
  assert.match(String(completed.downloadUrl), /workspaces\/space%20%2Fsite\/site-shares\//);
  const rows = await backend.list({});
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.site, "space /site");
  assert.equal(rows[0]?.status, "active");
  assert.equal("token" in rows[0]!, false);
  assert.equal("storage" in rows[0]!, false);
  await assert.rejects(backend.revoke({ shareId: newShareIdentity({}).shareId }), { code: "NOT_FOUND" });
  await assert.rejects(backend.create({ principalId: "owner", signal: AbortSignal.abort() }), { name: "AbortError" });
});

test("backend resolves a saved remote locator and leaves a revoked row when resolution fails", async t => {
  const r = await shareRegistry(t), row = await createSiteShare({ registry: r, ...input });
  await r.put({ record: { ...row, storage: { provider: "example-store", binding: "original", key: "k" } } });
  const resolutions: unknown[] = [];
  const backend = createSiteShareBackend({ registry: r, site: "ws", zip: zipFolderFiles, prepare: async () => assert.fail("not exporting"), delivery: async request => { resolutions.push(request); throw new Error("credentials removed"); } });
  await assert.rejects(backend.revoke({ shareId: row.shareId }), { code: "DELETE_FAILED" });
  assert.deepEqual(resolutions, [{ provider: "example-store", binding: "original" }]);
  assert.equal((await r.get(row))?.status, "revoked");
});

test("delivery selection pins the runtime binding and rejects unsupported providers without touching object storage", async t => {
  const r = await shareRegistry(t), runtime = createRuntimeShareDelivery({ registry: r, site: "ws", publicOrigin: "https://public.example", http: { send: async () => assert.fail("selection has no HTTP") } });
  const ports = { peer: async () => undefined, runtime: () => runtime, http: { send: async () => assert.fail("selection has no HTTP") }, objectStore: async () => undefined };
  assert.equal(await resolveShareDelivery(ports), runtime);
  assert.equal(await resolveShareDelivery(ports, { provider: "tovu-server", binding: r.directory }), runtime);
  assert.equal(await resolveShareDelivery(ports, { provider: "tovu-server", binding: "old" }), undefined);
  assert.equal(await resolveShareDelivery({ ...ports, objectStore: async () => assert.fail("unknown provider") }, { provider: "unknown" }), undefined);
});
for (const publicOrigin of ["http://public.example", "https://user@public.example", "https://:password@public.example", "https://public.example/path", "https://public.example/?x=1", "https://public.example/#fragment"]) {
  test(`runtime delivery rejects non-origin ${publicOrigin}`, async t => {
    const r = await shareRegistry(t);
    assert.throws(() => createRuntimeShareDelivery({ registry: r, site: "ws", publicOrigin, http: { send: async () => assert.fail() } }), { code: "STORAGE_SETUP" });
  });
}
test("runtime adapter rejects key/URL tampering and verifies every anonymous download header", async t => {
  const r = await shareRegistry(t), key = `_share/${"a".repeat(64)}/site.tovu.zip`;
  let status = 200, headers: Record<string, string> = { "content-length": "3", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow", "content-disposition": 'attachment; filename="site.tovu.zip"' };
  const calls: unknown[] = [];
  const runtime = createRuntimeShareDelivery({ registry: r, site: "ws", publicOrigin: "https://public.example", http: { send: async (input, options) => { calls.push({ input, options }); return { status, headers, bodyText: "" }; } } });
  const store = runtime.store, url = "https://public.example/" + key;
  await assert.rejects(store.upload({ key: "../bad", bytes: Buffer.from("zip"), headers: {} }), { code: "INVALID_INPUT" });
  assert.equal(await store.verify({ key, url: "https://evil.example/" + key, present: true, bytes: 3 }), false);
  assert.deepEqual(calls, []);
  assert.equal(await store.verify({ key, url, present: true, bytes: 3 }), true);
  for (const name of Object.keys(headers)) {
    const saved = headers; headers = { ...headers }; delete headers[name];
    assert.equal(await store.verify({ key, url, present: true, bytes: 3 }), false, name);
    headers = saved;
  }
  const invalidHeaders: Record<string, string>[] = [{ "content-length": "4" }, { "content-disposition": "inline" }];
  for (const patch of invalidHeaders) {
    const saved = headers; headers = { ...headers, ...patch };
    assert.equal(await store.verify({ key, url, present: true, bytes: 3 }), false); headers = saved;
  }
  status = 500; assert.equal(await store.verify({ key, url, present: true, bytes: 3 }), false);
  for (const code of [404, 410]) { status = code; assert.equal(await store.verify({ key, url, present: false }), true); }
  status = 200; assert.equal(await store.verify({ key, url, present: false }), false);
  const call = calls[0] as { input: { request: { method: string; headers: unknown; maxResponseBytes: number } }; options: unknown };
  assert.equal(call.input.request.method, "HEAD"); assert.deepEqual(call.input.request.headers, {});
  assert.equal(call.input.request.maxResponseBytes, 1024); assert.deepEqual(call.options, { redirect: "error" });
  await store.upload({ key, bytes: Buffer.from("zip"), headers: {} });
  await store.upload({ key, bytes: Buffer.from("zip"), headers: {} }); // Same bytes are idempotent.
  await assert.rejects(store.upload({ key, bytes: Buffer.from("different"), headers: {} }), { code: "ARTIFACT_CHANGED" });
  const alien = createRuntimeShareDelivery({ registry: r, site: "other", publicOrigin: "https://public.example", http: { send: async () => assert.fail() } });
  await assert.rejects(alien.store.upload({ key, bytes: Buffer.from("zip"), headers: {} }), { code: "ARTIFACT_CHANGED" });
  await store.delete({ key: `_share/${"b".repeat(64)}/site.tovu.zip` });
  await store.delete({ key });
  assert.equal(await r.findToken({ token: "a".repeat(64), file: "site.tovu.zip" }), null);
});

test("ordinary file cap applies independently of total expanded bytes", () => {
  assert.throws(() => checkShareLimits({ files: [{ path: "themes/huge.js", bytes: SHARE_LIMITS.maxFileBytes + 1 }] }), { code: "LIMIT_EXCEEDED", message: /themes\/huge.js.*64 MiB/ });
  assert.doesNotThrow(() => checkShareLimits({ files: [{ path: "database/content.db", bytes: SHARE_LIMITS.maxFileBytes + 1 }] }));
});
test("zip surfaces encoding failures, translates size refusals, detects stale files and increments progress", async t => {
  const r = await shareRegistry(t), failure = new Error("encoder unavailable");
  await assert.rejects(buildShareZip({ plan: plan(), zip: async () => { throw failure; } }), error => error === failure);
  await assert.rejects(buildShareZip({ plan: plan(), zip: async () => { throw new Error("too large"); } }), { code: "LIMIT_EXCEEDED" });
  const disk = path.join(r.directory, "page.html"); fs.writeFileSync(disk, "page"); const info = fs.statSync(disk);
  const content = { ...plan(), files: [{ path: "themes/page.html", root: r.directory, absPath: disk, bytes: 4, mtimeMs: info.mtimeMs, identity: fileIdentity(fs.statSync(disk, { bigint: true })), nlink: 1, scope: "themes" as const }] };
  const progress = { filesDone: 0, filesTotal: 3, bytesDone: 0, bytesTotal: 21 };
  let encoded = 0;
  await buildShareZip({ plan: content, zip: async args => { encoded++; assert.equal(args.files.length, 3); return zipFolderFiles(args); } }, { progress });
  assert.equal(encoded, 1); assert.equal(progress.filesDone, 2); assert.equal(progress.bytesDone, 21);
  fs.writeFileSync(disk, "changed");
  await assert.rejects(buildShareZip({ plan: content, zip: async () => assert.fail("stale plan must not encode") }), { code: "PLAN_STALE" });
});
test("portable paths enforce depth, dangerous filenames, content scanning and order-independent collisions", () => {
  for (const name of ["themes/" + Array(33).fill("x").join("/"), "themes/space /x", "themes/x?.txt", "themes/x<.txt", "themes/a:b", "themes/x\u007f"]) assert.throws(() => validateSharePath({ path: name }), { code: "UNSAFE_PATH" });
  for (const name of ["uploads/chat-attachments/a", "agent-plugins/ws/ws/staging/x", "plugins/a/1/memory/learned/a", "themes/.env.production"]) assert.equal(excludedSharePath({ path: name }), true);
  for (const name of ["themes/.git/a", "themes/.share-private/a", "themes/id_ed25519.pub", "themes/private_key.txt", "themes/foo.sqlite-wal", "themes/.mcp.a.json", "themes/restore-point-a", "themes/superseded-a"]) assert.throws(() => excludedSharePath({ path: name }), { code: "UNSAFE_FILE" });
  const bytes = Buffer.from("\u0000ghp_" + "x".repeat(36) + "\u0000");
  assert.throws(() => requireShareSecretFree({ path: "themes/a.png", bytes }), { code: "SECRET_IN_CONTENT" });
  for (const order of [["themes/file", "themes/file/child"], ["themes/file/child", "themes/file"], ["themes/A/x", "themes/a/y"], ["themes/x", "themes/x"]]) {
    const aliases = new Map<string, string>(), files = new Set<string>();
    claimSharePath({ path: order[0]!, directory: false, aliases, files });
    assert.throws(() => claimSharePath({ path: order[1]!, directory: false, aliases, files }), { code: "UNSAFE_PATH" });
  }
});

test("backend reports archive progress without starting a second ZIP and keeps verified links private", async t => {
  const r = await shareRegistry(t); let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  let encodes = 0;
  const backend = createSiteShareBackend({ registry: r, site: "ws", prepare: async () => ({ ...plan(), bufferedFiles: undefined }), zip: async args => { encodes++; entered(); await gate; return zipFolderFiles(args); }, delivery: async () => delivery() });
  const signal = new AbortController().signal;
  const pending = await backend.create({ principalId: "owner", signal }, { waitMs: 0 }) as { jobId: string };
  await started;
  const progress = await backend.create({ principalId: "owner", jobId: pending.jobId, signal }, { waitMs: 0 }) as { phase: string; progress: { filesTotal: number; bytesTotal: number } };
  assert.equal(progress.phase, "archive-or-upload"); assert.equal(progress.progress.filesTotal, 1); assert.equal(progress.progress.bytesTotal, 17);
  release();
  const done = await backend.create({ principalId: "owner", jobId: pending.jobId, signal }, { waitMs: 1000 }) as Record<string, unknown>;
  assert.equal(done.url, "https://bucket.example/site.zip"); assert.equal(done.message, undefined); assert.equal(done.storage, undefined); assert.equal(done.token, undefined); assert.equal(encodes, 1);
});
test("backend cancels a waiting caller and releases its active lane after preparation settles", async t => {
  const r = await shareRegistry(t); let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  let preparations = 0;
  const backend = createSiteShareBackend({ registry: r, site: "ws", prepare: async ({ signal }) => { preparations++; if (preparations === 1) { entered(); await gate; signal.throwIfAborted(); } return plan(); }, zip: zipFolderFiles, delivery: async () => undefined });
  const controller = new AbortController();
  const result = assert.rejects(backend.create({ principalId: "owner", signal: controller.signal }, { waitMs: 1000 }), { code: "CANCELLED" });
  await started; controller.abort(); await result;
  assert.deepEqual(await r.list({}), []);
  release();
  // The queued continuation is deterministic; allow the job's finally to release the lane.
  await new Promise<void>(resolve => setImmediate(resolve));
  const next = await backend.create({ principalId: "owner", signal: new AbortController().signal }, { waitMs: 1000 }) as { status: string };
  assert.equal(next.status, "active"); assert.equal(preparations, 2);
});
test("registry propagates broken directory/tombstone errors instead of treating them as absent", async t => {
  const r = await shareRegistry(t), row = await createSiteShare({ registry: r, ...input });
  fs.mkdirSync(path.join(r.directory, row.shareId + ".revoked"));
  await assert.rejects(r.get(row), { code: "EISDIR" });
  fs.rmSync(path.join(r.directory, row.shareId + ".revoked"), { recursive: true });
  fs.rmSync(path.join(r.directory, row.token + ".token")); fs.mkdirSync(path.join(r.directory, row.token + ".token"));
  await assert.rejects(r.reserveToken(row), { code: "EISDIR" });
  const invalidDirectory = path.join(r.directory, "file"); fs.writeFileSync(invalidDirectory, "not a folder");
  const broken = new SiteShareRegistry({ directory: invalidDirectory });
  await assert.rejects(broken.list({}), { code: "ENOTDIR" });
  await assert.rejects(broken.get(row), { code: "ENOTDIR" });
});

test("ZIP refuses an oversized manifest before encoding and preserves non-Error encoder failures", async () => {
  const oversized = { ...plan(), site: { name: "n".repeat(SHARE_LIMITS.maxManifestBytes - 100), folderName: "site" } };
  await assert.rejects(buildShareZip({ plan: oversized, zip: async () => assert.fail("oversized manifest must not encode") }), { code: "LIMIT_EXCEEDED", message: "Share manifest exceeds 2 MiB." });
  await assert.rejects(buildShareZip({ plan: { ...plan(), database: null, bufferedFiles: undefined }, zip: async () => { throw "encoder disconnected"; } }), error => error === "encoder disconnected");
});
