/** Import version refusals must tell the exporter to update and make a new ZIP, without accepting old DDL.
 * (Export-time schema refusals keep their own "update this site" advice: no ZIP exists yet.) */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import * as yauzl from "yauzl";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { sanitizeShareDatabase, rebuildImportDatabase } from "#src/server/runtime/composition/site-portability";
import { runtimeSchemaVersion } from "#src/platform/site-dir/schema-guard";
import { buildShareZip } from "../../share-zip.js";
import { verifySiteImport } from "../../import-verifier.js";
import { createShareArchiveReader } from "../../import-archive-reader.js";
import { createSiteImportBackend } from "../../import-backend.js";
import { importFixture } from "../import.fixture.js";

const advice = "This ZIP was made by a different Tovu version. Export the site again from an updated Tovu, then import the new ZIP.";
const schema = runtimeSchemaVersion();
const changes = [
  ["extra column", "ALTER TABLE posts ADD COLUMN old_build_field TEXT"],
  ["missing column", "ALTER TABLE posts DROP COLUMN autosave_json"],
  ["missing table", "DROP TABLE posts"],
] as const;

async function snapshot(t: TestContext, ddl?: string): Promise<Buffer> {
  const source = openContentDb({ filePath: ":memory:" });
  t.after(() => source.$client.close());
  source.$client.prepare("INSERT INTO workspaces(id,slug,name,created_at) VALUES ('ws','site','Site','2026-10-31T00:00:00Z')").run();
  const clean = await sanitizeShareDatabase({ snapshot: source.$client.serialize() });
  const changed = new Database(clean.bytes);
  try { if (ddl) changed.exec(ddl); return changed.serialize(); }
  finally { changed.close(); }
}

async function zip(bytes: Buffer, identity = schema): Promise<Buffer> {
  return buildShareZip({ plan: { target: { kind: "zip" }, profile: "share", database: { bytes, watermarkAtCapture: 0 }, files: [],
    bufferedFiles: [{ path: "settings.json", content: Buffer.from('{"name":"Site"}') }],
    include: { database: true, media: true, themes: true, plugins: true, settings: true }, skipped: [], scopeNotes: {},
    totalBytes: bytes.length + 15, site: { name: "Site", folderName: "site" }, schema: identity, tovuVersion: "older", createdAt: "2026-10-31T00:00:00Z" }, zip: zipFolderFiles });
}

function versionRefusal(code: string): (error: unknown) => boolean {
  return error => {
    assert.equal((error as { code: string }).code, code);
    assert.ok((error as Error).message.includes(advice), (error as Error).message);
    assert.doesNotMatch((error as Error).message, /Update (?:this |the )?site first/i);
    return true;
  };
}

function directorySnapshot(required: { root: string }): unknown[] {
  return fs.readdirSync(required.root, { recursive: true, withFileTypes: true }).map(entry => {
    const file = path.join(entry.parentPath, entry.name);
    return entry.isDirectory() ? [path.relative(required.root, file), "directory"]
      : [path.relative(required.root, file), fs.statSync(file).size, createHash("sha256").update(fs.readFileSync(file)).digest("hex")];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

for (const [label, ddl] of changes) test(`importing a ZIP with ${label} returns version advice through the isolated worker`, async t => {
  const archive = await zip(await snapshot(t, ddl));
  await assert.rejects(verifySiteImport({ archive, reader: createShareArchiveReader({ yauzl }), schema, sanitize: rebuildImportDatabase }), versionRefusal("INVALID_DATABASE"));
});

// The owner's specific-refusal rule requires a real source identity. 9081f631e's
// original fixtures invented index/tag pairs; retain both index and tag comparisons
// without presenting an invented identity as evidence of a genuine source version.
// Mutation: accept a different bundled identity; the sanitize fake is reached instead of version advice.
for (const [label, identity, recipientSchema] of [
  ["index", { index: 0, tag: "0000_yellow_ravenous" }, schema],
  ["tag", schema, { ...schema, tag: schema.tag + "-other-build" }],
] as const) test(`importing a ZIP with a different manifest schema ${label} returns version advice`, async t => {
  const h = await importFixture(t);
  const home = h.workspace.home({});
  fs.mkdirSync(path.join(home, "existing", "nested"), { recursive: true });
  fs.writeFileSync(path.join(home, "existing", "nested", "content.db"), "existing site bytes");
  const before = directorySnapshot({ root: home });
  const archive = await zip(await snapshot(t), identity);
  await assert.rejects(verifySiteImport({ archive, reader: createShareArchiveReader({ yauzl }), schema: recipientSchema, sanitize: async () => assert.fail("incompatible manifests must refuse before SQLite") }), versionRefusal("INVALID_ARCHIVE"));
  let sanitized = 0;
  const backend = createSiteImportBackend({ ...h.backendPorts, schema: recipientSchema, sanitize: async () => {
    sanitized++; return assert.fail("incompatible manifests must refuse before SQLite");
  } });
  const { uploadId } = await backend.upload({ principalId: "owner", archive });
  await assert.rejects(backend.importBackup({ principalId: "owner", source: { uploadId } }), versionRefusal("INVALID_ARCHIVE"));
  assert.equal(sanitized, 0);
  assert.deepEqual(directorySnapshot({ root: home }), before);
});

// Mutation: remove the unknown-identity refusal; its specific sentence/code assertion fails.
for (const identity of [{ index: 0, tag: "unknown-bk-identity" }, { index: schema.index + 1, tag: "unknown-next-bk-identity" }]) {
  test(`unknown archive identity ${identity.index} refuses before sanitizing and leaves sites home byte-identical`, async t => {
    const h = await importFixture(t), home = h.workspace.home({});
    fs.mkdirSync(path.join(home, "existing"));
    fs.writeFileSync(path.join(home, "existing", "content.db"), "do not change");
    const before = directorySnapshot({ root: home });
    let sanitized = 0;
    const backend = createSiteImportBackend({ ...h.backendPorts, sanitize: async () => {
      sanitized++; return assert.fail("unknown manifests must refuse before SQLite");
    } });
    const archive = await zip(await snapshot(t), identity);
    const { uploadId } = await backend.upload({ principalId: "owner", archive });
    await assert.rejects(backend.importBackup({ principalId: "owner", source: { uploadId } }), {
      code: "INVALID_ARCHIVE", message: `Unknown archive schema identity ${JSON.stringify(identity)}.`,
    });
    assert.equal(sanitized, 0);
    assert.deepEqual(directorySnapshot({ root: home }), before);
  });
}

test("a corrupt database retains its corruption refusal rather than claiming a version mismatch", async () => {
  await assert.rejects(rebuildImportDatabase({ snapshot: Buffer.from("not a SQLite database") }), {
    code: "INVALID_DATABASE", message: "Import database has unsupported schema, invalid references or unsafe data.",
  });
});

// A column-version difference must never hide an independent unsafe object, even when
// that object sorts after the changed table in sqlite_schema.
for (const [label, ddl, name] of [
  ["view", "CREATE VIEW hostile AS SELECT load_extension('/tmp/never')", "hostile"],
  ["trigger", "CREATE TRIGGER hostile AFTER INSERT ON posts BEGIN SELECT 1; END", "hostile"],
  ["undeclared table", "CREATE TABLE unknown_business(payload TEXT); INSERT INTO unknown_business VALUES ('required-data')", "unknown_business"],
  ["empty undeclared table", "CREATE TABLE unknown_empty(payload TEXT)", "unknown_empty"],
  ["virtual table", "CREATE VIRTUAL TABLE hostile USING fts5(payload)", "hostile"],
  ["index", "CREATE INDEX hostile ON posts(title)", "hostile"],
  ["missing index", "DROP INDEX idx_posts_workspace", "idx_posts_workspace"],
  ["generated column", "ALTER TABLE posts ADD COLUMN hostile TEXT GENERATED ALWAYS AS ('unsafe') VIRTUAL", "posts"],
] as const) test(`version advice never masks an untrusted ${label} refusal`, async t => {
  const archive = await zip(await snapshot(t, `ALTER TABLE posts ADD COLUMN old_build_field TEXT; ${ddl}`));
  await assert.rejects(verifySiteImport({ archive, reader: createShareArchiveReader({ yauzl }), schema, sanitize: rebuildImportDatabase }), error => {
    assert.equal((error as { code: string }).code, "INVALID_DATABASE");
    assert.ok((error as Error).message.includes(name), (error as Error).message);
    assert.match((error as Error).message, /schema|database/i);
    assert.doesNotMatch((error as Error).message, /different Tovu version|Update (?:this |the )?site first/i);
    return true;
  });
});

// Archive-controlled identifiers can be huge and contain invisible direction changes.
// Check both schema-object and populated-table refusals through the real ZIP/worker path.
for (const kind of ["view", "table"] as const) {
  for (const suffix of ["short", "x".repeat(1000)]) {
    test(`import ${kind} refusal bounds and sanitizes ${suffix.length}-character names`, async t => {
      const name = `hostile\u0001\n\u0085\u061c\u200e\u202e\u2066\u2069_${suffix}`;
      const ddl = kind === "view" ? `CREATE VIEW "${name}" AS SELECT 1`
        : `CREATE TABLE "${name}"(payload TEXT); INSERT INTO "${name}" VALUES ('data')`;
      const archive = await zip(await snapshot(t, ddl));
      await assert.rejects(verifySiteImport({ archive, reader: createShareArchiveReader({ yauzl }), schema, sanitize: rebuildImportDatabase }), error => {
        const refusal = error as Error & { code: string };
        assert.equal(refusal.code, "INVALID_DATABASE");
        assert.match(refusal.message, /hostile/);
        assert.doesNotMatch(refusal.message, /[\p{Cc}\p{Cf}]|\\u0001|\\n/u);
        assert.ok(refusal.message.length < 400, `refusal length: ${refusal.message.length}`);
        if (suffix.length > 120) assert.match(refusal.message, /…/);
        else assert.match(refusal.message, /hostile_short/);
        return true;
      });
    });
  }
}
