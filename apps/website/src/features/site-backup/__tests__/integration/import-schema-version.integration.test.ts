/** Import version refusals must tell the exporter to update and make a new ZIP, without accepting old DDL.
 * (Export-time schema refusals keep their own "update this site" advice: no ZIP exists yet.) */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import * as yauzl from "yauzl";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { sanitizeShareDatabase, rebuildImportDatabase } from "#src/server/runtime/composition/site-portability";
import { runtimeSchemaVersion } from "#src/platform/site-dir/schema-guard";
import { buildShareZip } from "../../share-zip.js";
import { verifySiteImport } from "../../import-verifier.js";
import { createShareArchiveReader } from "../../import-archive-reader.js";

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

for (const [label, ddl] of changes) test(`importing a ZIP with ${label} returns version advice through the isolated worker`, async t => {
  const archive = await zip(await snapshot(t, ddl));
  await assert.rejects(verifySiteImport({ archive, reader: createShareArchiveReader({ yauzl }), schema, sanitize: rebuildImportDatabase }), versionRefusal("INVALID_DATABASE"));
});

for (const identity of [{ ...schema, index: schema.index - 1 }, { ...schema, tag: schema.tag + "-old" }]) test(`importing a ZIP with a different manifest schema ${JSON.stringify(identity)} returns version advice`, async t => {
  const archive = await zip(await snapshot(t), identity);
  await assert.rejects(verifySiteImport({ archive, reader: createShareArchiveReader({ yauzl }), schema, sanitize: async () => assert.fail("incompatible manifests must refuse before SQLite") }), versionRefusal("INVALID_ARCHIVE"));
});

test("a corrupt database retains its corruption refusal rather than claiming a version mismatch", async () => {
  await assert.rejects(rebuildImportDatabase({ snapshot: Buffer.from("not a SQLite database") }), {
    code: "INVALID_DATABASE", message: "Import database has unsupported schema, invalid references or unsafe data.",
  });
});
