import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { AgentPluginArchiveEntry, AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { verifySiteImport } from "../import-verifier.js";
import { buildSiteBackupManifest } from "../sources.js";
import type { ShareDatabaseProjection } from "../share-policy.js";
import { importFixture } from "./import.fixture.js";

// The reader contract allows absent declared sizes and partial streams. Model those adapter
// outcomes directly; real ZIP decoding and preflight are exercised in import-malicious.
function entry(entryPath: string, bytes: Buffer, declaredSize: number | undefined = bytes.length): AgentPluginArchiveEntry {
  return { kind: "file", entryPath, declaredSize, async *openReadStream() { yield bytes; } };
}
function reader(entries: readonly AgentPluginArchiveEntry[]): AgentPluginArchiveReaderPort {
  return { async *entries() { yield* entries; } };
}

test("verifier requires declared sizes and counts actual stream bytes before retaining the payload", async t => {
  const h = await importFixture(t);
  for (const fixture of [{ ...entry("tovu-backup.json", Buffer.from("{}")), declaredSize: undefined }, entry("tovu-backup.json", Buffer.from("short"), 10), entry("tovu-backup.json", Buffer.alloc(2 * 1024 * 1024 + 1), 1)]) {
    await assert.rejects(verifySiteImport({ archive: Buffer.alloc(0), reader: reader([fixture]), schema: h.plan.schema, sanitize: async () => assert.fail("invalid stream must not sanitize") }), { code: "INVALID_ARCHIVE" });
  }
});
test("verifier rejects special entries and duplicate directories before content is read", async t => {
  const h = await importFixture(t);
  for (const entries of [[{ kind: "hardlink", entryPath: "themes/link" }], [{ kind: "directory", entryPath: "themes/" }, { kind: "directory", entryPath: "themes/" }]] as const) {
    await assert.rejects(verifySiteImport({ archive: Buffer.alloc(0), reader: reader(entries), schema: h.plan.schema, sanitize: async () => assert.fail() }), { code: "INVALID_ARCHIVE" });
  }
});
test("verifier checks projected media hashes, prunes excluded blobs, and refuses conflicting remaps", async t => {
  const h = await importFixture(t);
  const db = Buffer.from("archive DB"), blob = Buffer.from("one"), other = Buffer.from("two");
  const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const content = new Map([["database/content.db", db], ["uploads/source", blob], ["uploads/destination", other], ["uploads/excluded", Buffer.from("discard")]]);
  const manifest = Buffer.from(buildSiteBackupManifest({ ...h.plan, files: [...content].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) })) }));
  const entries: AgentPluginArchiveEntry[] = [{ kind: "directory", entryPath: "uploads/" }, entry("tovu-backup.json", manifest), ...[...content].map(([path, bytes]) => entry(path, bytes))];
  const verify = (projection: ShareDatabaseProjection) => verifySiteImport({ archive: Buffer.alloc(0), reader: reader(entries), schema: h.plan.schema, sanitize: async ({ snapshot }) => { assert.deepEqual(snapshot, db); return projection; } });
  const projection = { bytes: Buffer.from("fresh DB"), excludedBlobKeys: ["excluded"], media: [{ storageKey: "source", destinationStorageKey: "destination" }, { storageKey: "destination" }] };
  await assert.rejects(verify(projection), { code: "INVALID_ARCHIVE", message: "Conflicting imported document blob keys." });
  await assert.rejects(verify({ ...projection, media: [{ storageKey: "source", sha256: "0".repeat(64) }, { storageKey: "destination" }] }), { code: "INVALID_ARCHIVE", message: "Referenced media is missing or failed its hash." });
  await assert.rejects(verify({ ...projection, documents: [{ storageKey: "source", sha256: "0".repeat(64), originalFilename: "file.md" }], media: [{ storageKey: "source", sha256: "0".repeat(64) }, { storageKey: "destination" }] }), { code: "INVALID_ARCHIVE", message: "Referenced document blob is missing or corrupt." });
  const result = await verify({ ...projection, media: [{ storageKey: "source", destinationStorageKey: "moved" }, { storageKey: "destination", destinationStorageKey: "destination" }], excludedBlobKeys: ["excluded", "source"] });
  assert.deepEqual(result.database, Buffer.from("fresh DB"));
  assert.deepEqual([...result.files], [["uploads/destination", other], ["uploads/moved", blob]]);
});

test("verifier refuses file/directory collisions in both orders", async t => {
  const h = await importFixture(t);
  const file = entry("themes/collision", Buffer.alloc(0)), directory = { kind: "directory" as const, entryPath: "themes/collision/" };
  for (const entries of [[file, directory], [directory, file]]) await assert.rejects(verifySiteImport({ archive: Buffer.alloc(0), reader: reader(entries), schema: h.plan.schema, sanitize: async () => assert.fail() }), { code: "INVALID_ARCHIVE", message: /collision/ });
});

test("identical bytes may share a remapped destination without being treated as a conflicting blob", async t => {
  const h = await importFixture(t), bytes = Buffer.from("same blob"), db = Buffer.from("archive DB");
  const content = new Map([["database/content.db", db], ["uploads/source", bytes], ["uploads/destination", bytes]]);
  const manifest = Buffer.from(buildSiteBackupManifest({ ...h.plan, files: [...content].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })) }));
  const result = await verifySiteImport({ archive: Buffer.alloc(0), schema: h.plan.schema,
    reader: reader([entry("tovu-backup.json", manifest), ...[...content].map(([path, bytes]) => entry(path, bytes))]),
    sanitize: async () => ({ bytes: Buffer.from("fresh DB"), media: [{ storageKey: "source", destinationStorageKey: "destination" }, { storageKey: "destination" }] }),
  });
  assert.deepEqual([...result.files], [["uploads/destination", bytes]]);
});
