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
import { SiteShareRegistry } from "../share-registry.js";
import { createSiteShare, revokeSiteShare, type ShareDelivery } from "../share-service.js";
import { sanitizeShareDatabase } from "../../../platform/db/sqlite/share-database.js";
import { FIRST_PARTY_DATA_MODULES } from "../../plugins/data-modules.js";
import { declareDataModule } from "../../plugins/data-module.js";
import { importFixture, stamp } from "./import.fixture.js";

async function shareRegistry(t: import("node:test").TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), "share-refusals-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new SiteShareRegistry({ directory });
}

function fakeRemote(state: { present: boolean; deletes: number }): ShareDelivery {
  return {
    provider: "s3-compatible", binding: "bucket-a",
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
  await registry.put({ record: { ...row, url: "https://bucket.example.test/x", storage: { provider: "s3-compatible", binding: "bucket-a", key: "k" } } });
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
  await registry.put({ record: { ...row, url: "https://bucket.example.test/x", storage: { provider: "s3-compatible", binding: "bucket-a", key: "k" } } });
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
