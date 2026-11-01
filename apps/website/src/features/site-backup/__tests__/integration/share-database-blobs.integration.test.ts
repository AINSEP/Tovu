/** BLOBs must pass the same omission policy as text before any bytes enter the share DB. */
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import * as yauzl from "yauzl";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { contentKernel } from "#src/platform/db/content-kernel";
import { declareDataModule, type DataModuleDecl } from "#src/features/plugins/data-module";
import { runtimeSchemaVersion } from "#src/platform/site-dir/schema-guard";
import { sanitizeShareDatabase } from "../../share-database/repo.sqlite.js";
import { buildShareZip } from "../../share-zip.js";
import { createShareArchiveReader } from "../../import-archive-reader.js";

const stamp = "2026-10-31T00:00:00Z";
const key = "ghp_" + "x".repeat(36);
const records = [
  { id: "vendor", bytes: Buffer.from(key) },
  { id: "bearer", bytes: Buffer.from("Authorization: Bearer credentialValue987654321") },
  { id: "mixed", bytes: Buffer.concat([Buffer.from([0xff, 0x00]), Buffer.from(key)]) },
  { id: "prose", bytes: Buffer.from("Saved café 日本語 content") },
  { id: "binary", bytes: Buffer.from([0xff, 0xfe, 0x00, 0x80]) },
  { id: "empty", bytes: Buffer.alloc(0) },
];

for (const notNull of [false, true]) test(`sharing plugin BLOB columns omits credentials with notices (notNull=${notNull})`, async t => {
  const source = openContentDb({ filePath: ":memory:" });
  t.after(() => source.$client.close());
  source.$client.prepare("INSERT INTO workspaces(id,slug,name,created_at) VALUES ('ws','site','Site',?)").run(stamp);
  const decl: DataModuleDecl = { pluginId: "blobfixture", pluginTier: "tier-2", provenance: { sourceUrl: "test://blobfixture", publisher: "test" }, tables: [{
    name: "records", columns: [{ name: "id", type: "TEXT", primaryKey: true }, { name: "payload_json", type: "BLOB", notNull }, { name: "text", type: "TEXT" }],
    portability: { kind: "portable", columns: ["id", "payload_json", "text"] },
  }] };
  assert.equal((await declareDataModule({ db: contentKernel(source), dbPath: ":memory:", decl })).ok, true);
  const insert = source.$client.prepare("INSERT INTO p_blobfixture__records VALUES (?, ?, ?)");
  for (const row of records) insert.run(row.id, row.bytes, row.id === "vendor" ? key : "ordinary text");
  if (!notNull) insert.run("null", null, null);
  const before = source.$client.serialize();
  const projection = await sanitizeShareDatabase({ snapshot: before, modules: [decl] });
  // Inspect the actual DB delivered in a ZIP, not just an intermediate sanitized object.
  const archive = await buildShareZip({ plan: { target: { kind: "zip" }, profile: "share", database: { bytes: projection.bytes, watermarkAtCapture: 0 }, files: [],
    bufferedFiles: [{ path: "settings.json", content: Buffer.from('{"name":"Site"}') }],
    include: { database: true, media: true, themes: true, plugins: true, settings: true }, skipped: [], scopeNotes: {}, notices: projection.notices,
    totalBytes: projection.bytes.length + 15, site: { name: "Site", folderName: "site" }, schema: runtimeSchemaVersion(), tovuVersion: "test", createdAt: stamp }, zip: zipFolderFiles });
  let bytes: Buffer | undefined;
  for await (const entry of createShareArchiveReader({ yauzl }).entries({ archive })) {
    if (entry.kind !== "file" || entry.entryPath !== "content.db") continue;
    const chunks: Buffer[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
    bytes = Buffer.concat(chunks);
  }
  assert.ok(bytes);
  const shared = new Database(bytes); t.after(() => shared.close());
  const read = shared.prepare("SELECT payload_json, text, typeof(payload_json) AS kind FROM p_blobfixture__records WHERE id = ?");
  for (const id of ["vendor", "bearer", "mixed"]) {
    assert.deepEqual(read.get(id)!.payload_json, Buffer.alloc(0), id);
    assert.equal(read.get(id)!.kind, "blob", "blanking preserves BLOB storage type");
    assert.ok(projection.notices!.includes(`Saved content that looked like a key was left out: p_blobfixture__records.payload_json row ${id}.`));
  }
  for (const row of records.slice(3)) assert.deepEqual(read.get(row.id)!.payload_json, row.bytes);
  if (!notNull) assert.equal(read.get("null")!.payload_json, null);
  assert.equal(read.get("vendor")!.text, "");
  assert.ok(projection.notices!.includes("Saved content that looked like a key was left out: p_blobfixture__records.text row vendor."));
  assert.equal(projection.notices!.length, 4);
  for (const secret of [key, "credentialValue987654321"]) {
    assert.equal(bytes.includes(Buffer.from(secret)), false, "no credential bytes in SQLite pages");
    assert.equal(projection.notices!.join().includes(secret), false);
  }
  assert.deepEqual(source.$client.serialize(), before, "sharing never edits the live database");
});
