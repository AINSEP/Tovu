/**
 * Pins every refusal and pass-through branch of `verifySiteImport` with typed in-memory reader
 * fakes, so the archive verifier's order of checks and exact refusal texts stay provably identical
 * across refactors. Real ZIP decoding and the full A→B import are exercised in import-malicious.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { AgentPluginArchiveEntry, AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { verifySiteImport } from "../import-verifier.js";
import { SHARE_LIMITS, type ShareDatabaseProjection, type ShareDatabaseSanitizer } from "../share-policy.js";
import { admitProjectedDocuments, type DocumentAdmission } from "../import-verifier-projection.js";

const SCHEMA = { index: 7, tag: "schema-tag" };
const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const DB = Buffer.from("archive database");
const MEDIA = Buffer.from("media bytes");
const DOC = Buffer.from("# Notes\n");
type Content = readonly (readonly [string, Buffer])[];
const CONTENT: Content = [
  ["database/content.db", DB], ["themes/site/index.html", Buffer.from("<main>theme</main>")],
  ["uploads/m1", MEDIA], ["settings/config.json", Buffer.from("{}")],
];
const PROJECTION: ShareDatabaseProjection = { bytes: Buffer.from("fresh database"), media: [{ storageKey: "m1", sha256: sha(MEDIA) }] };
const INVALID = (message: string | RegExp) => ({ code: "INVALID_ARCHIVE", message });

function fileEntry(entryPath: string, bytes: Buffer, declaredSize: number | undefined = bytes.length, onRead?: () => void): AgentPluginArchiveEntry {
  return { kind: "file", entryPath, declaredSize, async *openReadStream() { onRead?.(); yield bytes; } };
}
function dirEntry(entryPath: string): AgentPluginArchiveEntry { return { kind: "directory", entryPath }; }
function record([path, bytes]: readonly [string, Buffer]): { path: string; bytes: number; sha256: string } { return { path, bytes: bytes.length, sha256: sha(bytes) }; }
function manifestJson(overrides: Record<string, unknown> = {}, content: Content = CONTENT): Record<string, unknown> {
  return {
    format: "tovu-site-backup", formatVersion: 1, profile: "share", sanitizationVersion: 1, schema: SCHEMA,
    database: { engine: "sqlite", path: "database/content.db" }, site: { name: "  Portable  " }, files: content.map(record), ...overrides,
  };
}
function archive(options: { manifest?: unknown; content?: Content; before?: AgentPluginArchiveEntry[]; after?: AgentPluginArchiveEntry[] } = {}): AgentPluginArchiveEntry[] {
  const content = options.content ?? CONTENT;
  const manifest = Buffer.from(JSON.stringify("manifest" in options ? options.manifest : manifestJson({}, content)));
  return [...(options.before ?? []), fileEntry("tovu-backup.json", manifest), ...content.map(([path, bytes]) => fileEntry(path, bytes)), ...(options.after ?? [])];
}
function readerOf(entries: readonly AgentPluginArchiveEntry[], onEntry?: (index: number) => void): AgentPluginArchiveReaderPort {
  return { async *entries() { for (const [index, entry] of entries.entries()) { onEntry?.(index); yield entry; } } };
}
function sanitizer(projection: ShareDatabaseProjection = PROJECTION, onCall?: () => void): { sanitize: ShareDatabaseSanitizer; calls: { snapshot: Buffer; signal: AbortSignal | undefined }[] } {
  const calls: { snapshot: Buffer; signal: AbortSignal | undefined }[] = [];
  return { calls, sanitize: async (required, optional) => { calls.push({ snapshot: required.snapshot, signal: optional?.signal }); onCall?.(); return projection; } };
}
function verify(entries: readonly AgentPluginArchiveEntry[], options: { projection?: ShareDatabaseProjection; sanitize?: ShareDatabaseSanitizer; archiveBytes?: Buffer } = {}) {
  return verifySiteImport({ archive: options.archiveBytes ?? Buffer.alloc(0), reader: readerOf(entries), schema: SCHEMA, sanitize: options.sanitize ?? sanitizer(options.projection).sanitize });
}
async function refusesBeforeSanitize(entries: readonly AgentPluginArchiveEntry[], expected: { code: string; message: string | RegExp }): Promise<void> {
  const fake = sanitizer();
  await assert.rejects(verifySiteImport({ archive: Buffer.alloc(0), reader: readerOf(entries), schema: SCHEMA, sanitize: fake.sanitize }), expected);
  assert.equal(fake.calls.length, 0);
}

// Success shape -------------------------------------------------------------------------------

test("a valid archive returns the trimmed site name, the projected database and every non-database file", async () => {
  const fake = sanitizer();
  const result = await verifySiteImport({ archive: Buffer.alloc(0), reader: readerOf(archive({ before: [dirEntry("themes/")] })), schema: SCHEMA, sanitize: fake.sanitize });
  assert.equal(result.name, "Portable");
  assert.deepEqual(result.database, PROJECTION.bytes);
  assert.deepEqual([...result.files.keys()], ["themes/site/index.html", "uploads/m1", "settings/config.json"]);
  assert.deepEqual(fake.calls, [{ snapshot: DB, signal: undefined }]);
});
test("the sanitizer receives the caller's abort signal", async () => {
  const fake = sanitizer(), signal = new AbortController().signal;
  await verifySiteImport({ archive: Buffer.alloc(0), reader: readerOf(archive()), schema: SCHEMA, sanitize: fake.sanitize }, { signal });
  assert.equal(fake.calls[0]?.signal, signal);
});
test("every recognised share root and both settings files are admitted", async () => {
  const content: Content = [...CONTENT, ...["plugins/p/index.js", "agent-plugins/ws/w/activations.json", "skills/s/SKILL.md", "overrides/site.css", "settings/.site-meta.json"].map(path => [path, Buffer.from("plain")] as const)];
  const result = await verify(archive({ content }));
  assert.equal(result.files.size, content.length - 1);
});
test("the database snapshot is exempt from the content secret scan", async () => {
  const secretDb = Buffer.from("ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8");
  const content: Content = CONTENT.map(([path, bytes]) => [path, path === "database/content.db" ? secretDb : bytes] as const);
  const result = await verify(archive({ content }));
  assert.deepEqual(result.database, PROJECTION.bytes);
});
test("a site name of exactly 200 characters is accepted", async () => {
  const name = "x".repeat(200);
  assert.equal((await verify(archive({ manifest: manifestJson({ site: { name } }) }))).name, name);
});

// Abort points --------------------------------------------------------------------------------

test("an already-aborted signal stops before the archive is read", async () => {
  const controller = new AbortController(), reason = new Error("stopped before reading");
  controller.abort(reason);
  let read = false;
  await assert.rejects(verifySiteImport({ archive: Buffer.alloc(0), reader: { async *entries() { read = true; } }, schema: SCHEMA, sanitize: sanitizer().sanitize }, { signal: controller.signal }), reason);
  assert.equal(read, false);
});
test("an abort between metadata entries stops the first pass", async () => {
  const controller = new AbortController(), reason = new Error("stopped between entries");
  const reader = readerOf(archive(), index => { if (index === 1) controller.abort(reason); });
  await assert.rejects(verifySiteImport({ archive: Buffer.alloc(0), reader, schema: SCHEMA, sanitize: sanitizer().sanitize }, { signal: controller.signal }), reason);
});
test("an abort while the manifest streams stops the bounded read", async () => {
  const controller = new AbortController(), reason = new Error("stopped in manifest");
  const manifest = Buffer.from(JSON.stringify(manifestJson()));
  const entries = [fileEntry("tovu-backup.json", manifest, manifest.length, () => controller.abort(reason))];
  await assert.rejects(verifySiteImport({ archive: Buffer.alloc(0), reader: readerOf(entries), schema: SCHEMA, sanitize: sanitizer().sanitize }, { signal: controller.signal }), reason);
});
test("an abort while a listed file streams stops the second pass", async () => {
  const controller = new AbortController(), reason = new Error("stopped in content");
  const entries = archive().map(entry => entry.entryPath === "database/content.db" ? fileEntry("database/content.db", DB, DB.length, () => controller.abort(reason)) : entry);
  await assert.rejects(verifySiteImport({ archive: Buffer.alloc(0), reader: readerOf(entries), schema: SCHEMA, sanitize: sanitizer().sanitize }, { signal: controller.signal }), reason);
});
test("an abort before document admission stops the document loop", async () => {
  const controller = new AbortController(), reason = new Error("stopped before documents");
  const content: Content = [...CONTENT, ["uploads/d1", DOC]];
  const projection: ShareDatabaseProjection = { bytes: Buffer.from("fresh"), media: [{ storageKey: "m1" }, { storageKey: "d1" }], documents: [{ storageKey: "d1", sha256: sha(DOC), originalFilename: "notes.md" }] };
  const fake = sanitizer(projection, () => controller.abort(reason));
  await assert.rejects(verifySiteImport({ archive: Buffer.alloc(0), reader: readerOf(archive({ content })), schema: SCHEMA, sanitize: fake.sanitize }, { signal: controller.signal }), reason);
});

// First pass: metadata ------------------------------------------------------------------------

test("an archive over 300 MiB is refused before any entry is read", async () => {
  let read = false;
  await assert.rejects(verifySiteImport({ archive: Buffer.allocUnsafeSlow(SHARE_LIMITS.maxArchiveBytes + 1), reader: { async *entries() { read = true; } }, schema: SCHEMA, sanitize: sanitizer().sanitize }), INVALID("Import exceeds the v1 300 MiB archive cap."));
  assert.equal(read, false);
});
test("the 2,001st entry is refused", async () => {
  const entries = Array.from({ length: SHARE_LIMITS.maxFiles + 1 }, (_, i) => fileEntry("themes/f-" + i, Buffer.alloc(0)));
  await refusesBeforeSanitize(entries, INVALID("Import exceeds the v1 2,000-entry cap."));
});
for (const kind of ["symlink", "hardlink", "device", "fifo"] as const) {
  test(`a ${kind} entry is refused`, async () => {
    await refusesBeforeSanitize([{ kind, entryPath: "themes/link" }], INVALID("ZIP links and special entries are forbidden."));
  });
}
test("an unsafe entry path is refused by the path claim", async () => {
  await refusesBeforeSanitize([fileEntry("themes/CON.txt", Buffer.alloc(0))], { code: "UNSAFE_PATH", message: "Share path 'themes/CON.txt' is unsafe." });
});
test("a repeated directory is refused", async () => {
  await refusesBeforeSanitize([dirEntry("themes/"), dirEntry("themes/")], INVALID("Duplicate directory or file/directory collision."));
});
test("a directory after a file of the same name is refused", async () => {
  await refusesBeforeSanitize([fileEntry("themes/x", Buffer.alloc(0)), dirEntry("themes/x/")], INVALID("Duplicate directory or file/directory collision."));
});
test("a file after a directory of the same name is refused", async () => {
  await refusesBeforeSanitize([dirEntry("themes/x/"), fileEntry("themes/x", Buffer.alloc(0))], INVALID("ZIP file/directory collision."));
});
for (const [label, declared] of [["absent", undefined], ["negative", -1], ["fractional", 1.5]] as const) {
  test(`an ${label} declared size is refused`, async () => {
    const entry: AgentPluginArchiveEntry = { kind: "file", entryPath: "themes/a", declaredSize: declared, async *openReadStream() { yield Buffer.alloc(0); } };
    await refusesBeforeSanitize([entry], INVALID("ZIP has an invalid declared size."));
  });
}
test("a declared file over 64 MiB is refused from metadata alone", async () => {
  await refusesBeforeSanitize([fileEntry("themes/big", Buffer.alloc(0), SHARE_LIMITS.maxFileBytes + 1)], { code: "LIMIT_EXCEEDED", message: "Share file 'themes/big' exceeds the 64 MiB ordinary-file cap." });
});
test("a manifest stream longer than the 2 MiB manifest cap is refused as a possible ZIP bomb", async () => {
  const big = Buffer.alloc(SHARE_LIMITS.maxManifestBytes + 1);
  await refusesBeforeSanitize([fileEntry("tovu-backup.json", big, 1)], INVALID("Expanded ZIP bytes exceed the manifest or v1 cap (possible ZIP bomb)."));
});
test("a manifest stream shorter than its declared size is refused", async () => {
  await refusesBeforeSanitize([fileEntry("tovu-backup.json", Buffer.from("{}"), 10)], INVALID("ZIP declared and actual size differ."));
});
test("an archive without the root manifest is refused", async () => {
  await refusesBeforeSanitize(archive().filter(entry => entry.entryPath !== "tovu-backup.json"), INVALID("Root tovu-backup.json manifest is required."));
});
test("a manifest that is not JSON is refused", async () => {
  await refusesBeforeSanitize([fileEntry("tovu-backup.json", Buffer.from("{"))], INVALID("Invalid share manifest JSON."));
});

// Manifest identity ---------------------------------------------------------------------------

const UNSUPPORTED = INVALID("Unsupported share format/profile/version, schema identity, database or site name.");
const IDENTITY_CASES: readonly [string, unknown][] = [
  ["a null manifest", null], ["a numeric manifest", 5],
  ["another format", manifestJson({ format: "other" })], ["format version 2", manifestJson({ formatVersion: 2 })],
  ["the backup profile", manifestJson({ profile: "backup" })], ["sanitization version 2", manifestJson({ sanitizationVersion: 2 })],
  ["a missing schema", manifestJson({ schema: undefined })], ["another schema index", manifestJson({ schema: { ...SCHEMA, index: 8 } })],
  ["another schema tag", manifestJson({ schema: { ...SCHEMA, tag: "forged" } })],
  ["a missing database", manifestJson({ database: undefined })], ["another database engine", manifestJson({ database: { engine: "postgres", path: "database/content.db" } })],
  ["another database path", manifestJson({ database: { engine: "sqlite", path: "other.db" } })],
  ["a non-array file list", manifestJson({ files: {} })], ["a 2,000-record file list", manifestJson({ files: Array(SHARE_LIMITS.maxFiles).fill(record(CONTENT[0]!)) })],
  ["a missing site", manifestJson({ site: undefined })], ["a non-string site name", manifestJson({ site: { name: 42 } })],
  ["a blank site name", manifestJson({ site: { name: "  " } })], ["a 201-character site name", manifestJson({ site: { name: "x".repeat(201) } })],
];
for (const [label, manifest] of IDENTITY_CASES) {
  test(`a manifest with ${label} is refused`, async () => { await refusesBeforeSanitize(archive({ manifest }), UNSUPPORTED); });
}

// Manifest inventory ---------------------------------------------------------------------------

const withFiles = (files: unknown[]) => archive({ manifest: manifestJson({ files }) });
const RECORDS = CONTENT.map(record);
const INVALID_RECORDS: readonly [string, unknown][] = [
  ["a null record", null], ["a non-string path", { ...RECORDS[1], path: 4 }], ["a fractional size", { ...RECORDS[1], bytes: 0.5 }],
  ["a negative size", { ...RECORDS[1], bytes: -1 }], ["a missing size", { ...RECORDS[1], bytes: undefined }],
  ["an uppercase hash", { ...RECORDS[1], sha256: RECORDS[1]!.sha256.toUpperCase() }], ["a missing hash", { ...RECORDS[1], sha256: undefined }],
];
for (const [label, bad] of INVALID_RECORDS) {
  test(`a manifest file list with ${label} is refused`, async () => { await refusesBeforeSanitize(withFiles([RECORDS[0], bad]), INVALID("Invalid manifest file record.")); });
}
test("an unsafe manifest path is refused by the share path policy", async () => {
  await refusesBeforeSanitize(withFiles([...RECORDS, { ...RECORDS[1], path: "themes/CON.txt" }]), { code: "UNSAFE_PATH", message: "Share path 'themes/CON.txt' is unsafe." });
});
test("a repeated manifest path is refused", async () => {
  await refusesBeforeSanitize(withFiles([...RECORDS, RECORDS[1]]), INVALID("Duplicate manifest file."));
});
test("a manifest that lists itself is refused", async () => {
  await refusesBeforeSanitize(withFiles([...RECORDS, { ...RECORDS[1], path: "tovu-backup.json" }]), INVALID("Duplicate manifest file."));
});
for (const path of ["unknown/content.txt", "settings/other.json", "themes", "uploads/chat-attachments/a.png"]) {
  test(`the manifest path ${JSON.stringify(path)} is refused as unrecognized or private`, async () => {
    await refusesBeforeSanitize(withFiles([...RECORDS, { ...RECORDS[1], path }]), INVALID("Unrecognized or private file in share inventory."));
  });
}
test("a suspicious manifest path is refused by the share exclusion policy", async () => {
  await refusesBeforeSanitize(withFiles([...RECORDS, { ...RECORDS[1], path: "themes/vault.txt" }]), { code: "UNSAFE_FILE", message: "Share refuses suspicious required path 'themes/vault.txt'. Remove it before sharing." });
});
test("a manifest listing more files than the archive holds is refused", async () => {
  await refusesBeforeSanitize(withFiles([...RECORDS, { ...RECORDS[1], path: "themes/ghost" }]), INVALID("ZIP inventory differs from the manifest."));
});
test("a manifest without the database record is refused even when the counts match", async () => {
  await refusesBeforeSanitize(withFiles([...RECORDS.slice(1), { ...RECORDS[1], path: "themes/ghost" }]), INVALID("ZIP inventory differs from the manifest."));
});
test("a directory with no listed file below it is refused", async () => {
  await refusesBeforeSanitize(archive({ before: [dirEntry("skills/")] }), INVALID("Unlisted ZIP directory."));
});

// Second pass: content -------------------------------------------------------------------------

test("an archive file missing from the manifest is refused while reading content", async () => {
  const content: Content = [...CONTENT, ["themes/a", Buffer.from("a")]];
  const manifest = manifestJson({ files: [...RECORDS, { ...record(["themes/b", Buffer.from("a")]) }] });
  await refusesBeforeSanitize(archive({ content, manifest }), INVALID("Unlisted ZIP file or size mismatch."));
});
test("a declared size that differs from the manifest is refused", async () => {
  await refusesBeforeSanitize(withFiles(RECORDS.map((file, i) => i === 1 ? { ...file, bytes: file.bytes + 1 } : file)), INVALID("Unlisted ZIP file or size mismatch."));
});
test("content whose SHA-256 differs from the manifest is refused", async () => {
  await refusesBeforeSanitize(withFiles(RECORDS.map((file, i) => i === 1 ? { ...file, sha256: "0".repeat(64) } : file)), INVALID("ZIP size or SHA-256 mismatch."));
});
test("a content stream longer than its declared size is refused as a possible ZIP bomb", async () => {
  const entries = archive().map(entry => entry.entryPath === "database/content.db" ? fileEntry("database/content.db", Buffer.concat([DB, Buffer.from("!")]), DB.length) : entry);
  await refusesBeforeSanitize(entries, INVALID("Expanded ZIP bytes exceed the manifest or v1 cap (possible ZIP bomb)."));
});
test("a content stream shorter than its declared size is refused", async () => {
  const entries = archive().map(entry => entry.entryPath === "database/content.db" ? fileEntry("database/content.db", DB.subarray(1), DB.length) : entry);
  await refusesBeforeSanitize(entries, INVALID("ZIP declared and actual size differ."));
});
test("credential-shaped content in a listed file is refused", async () => {
  const content: Content = [...CONTENT, ["themes/site/leak.txt", Buffer.from("token ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8")]];
  await refusesBeforeSanitize(archive({ content }), { code: "SECRET_IN_CONTENT", message: "Share refused: 'themes/site/leak.txt' contains credential-shaped content. Remove the secret before sharing." });
});

// Projection: excluded blobs, unreferenced uploads, media --------------------------------------

test("an excluded blob key that is not a safe path is refused", async () => {
  await assert.rejects(verify(archive(), { projection: { ...PROJECTION, excludedBlobKeys: ["CON.txt"] } }), { code: "UNSAFE_PATH", message: "Share path 'uploads/CON.txt' is unsafe." });
});
test("an excluded, unreferenced blob is dropped from the result", async () => {
  const content: Content = [...CONTENT, ["uploads/old", Buffer.from("old")]];
  const result = await verify(archive({ content }), { projection: { ...PROJECTION, excludedBlobKeys: ["old"] } });
  assert.equal(result.files.has("uploads/old"), false);
});
test("an excluded blob that the database still references is kept", async () => {
  const result = await verify(archive(), { projection: { ...PROJECTION, excludedBlobKeys: ["m1"] } });
  assert.deepEqual(result.files.get("uploads/m1"), MEDIA);
});
test("an upload the database does not reference is refused", async () => {
  const content: Content = [...CONTENT, ["uploads/stray", Buffer.from("stray")]];
  await assert.rejects(verify(archive({ content })), INVALID("Unreferenced uploads are outside the portable share media policy."));
});
test("a referenced media key that is not a safe path is refused", async () => {
  await assert.rejects(verify(archive(), { projection: { ...PROJECTION, media: [...PROJECTION.media, { storageKey: "CON.txt" }] } }), { code: "UNSAFE_PATH", message: "Share path 'uploads/CON.txt' is unsafe." });
});
test("referenced media missing from the archive is refused", async () => {
  await assert.rejects(verify(archive(), { projection: { ...PROJECTION, media: [...PROJECTION.media, { storageKey: "absent" }] } }), INVALID("Referenced media is missing or failed its hash."));
});
test("referenced media whose hash differs from the database is refused", async () => {
  await assert.rejects(verify(archive(), { projection: { ...PROJECTION, media: [{ storageKey: "m1", sha256: "0".repeat(64) }] } }), INVALID("Referenced media is missing or failed its hash."));
});
test("referenced media without a database hash is accepted on presence alone", async () => {
  const result = await verify(archive(), { projection: { ...PROJECTION, media: [{ storageKey: "m1" }] } });
  assert.deepEqual(result.files.get("uploads/m1"), MEDIA);
});
test("a missing media blob that backs a document is refused as a document blob", async () => {
  const projection: ShareDatabaseProjection = { ...PROJECTION, media: [...PROJECTION.media, { storageKey: "d1" }], documents: [{ storageKey: "d1", sha256: sha(DOC), originalFilename: "notes.md" }] };
  await assert.rejects(verify(archive(), { projection }), INVALID("Referenced document blob is missing or corrupt."));
});

// Projection: documents -----------------------------------------------------------------------

const DOC_CONTENT: Content = [...CONTENT, ["uploads/d1", DOC]];
const docProjection = (document: { sha256?: string; originalFilename?: string; storageKey?: string }): ShareDatabaseProjection => ({
  ...PROJECTION, media: [...PROJECTION.media, { storageKey: "d1" }],
  documents: [{ storageKey: document.storageKey ?? "d1", sha256: document.sha256 ?? sha(DOC), originalFilename: document.originalFilename ?? "notes.md" }],
});
test("a valid Library document is admitted", async () => {
  const result = await verify(archive({ content: DOC_CONTENT }), { projection: docProjection({}) });
  assert.deepEqual(result.files.get("uploads/d1"), DOC);
});
test("a document whose blob is not in the archive is refused", async () => {
  const projection: ShareDatabaseProjection = { ...PROJECTION, documents: [{ storageKey: "d2", sha256: sha(DOC), originalFilename: "notes.md" }] };
  await assert.rejects(verify(archive(), { projection }), INVALID("Referenced document blob is missing or corrupt."));
});
test("a document whose blob hash differs is refused", async () => {
  await assert.rejects(verify(archive({ content: DOC_CONTENT }), { projection: docProjection({ sha256: "0".repeat(64) }) }), INVALID("Referenced document blob is missing or corrupt."));
});
test("a document the upload policy rejects is refused with the policy's reason", async () => {
  await assert.rejects(verify(archive({ content: DOC_CONTENT }), { projection: docProjection({ originalFilename: "notes.pdf" }) }), INVALID(/^Invalid Library document: \S/));
});

// Projection: destination remaps and the final cap ---------------------------------------------

const MOVE_CONTENT: Content = [...CONTENT, ["uploads/source", Buffer.from("one")], ["uploads/destination", Buffer.from("two")]];
test("a remapped destination that is not a safe path is refused", async () => {
  const projection: ShareDatabaseProjection = { ...PROJECTION, media: [...PROJECTION.media, { storageKey: "source", destinationStorageKey: "CON.txt" }, { storageKey: "destination" }] };
  await assert.rejects(verify(archive({ content: MOVE_CONTENT }), { projection }), { code: "UNSAFE_PATH", message: "Share path 'uploads/CON.txt' is unsafe." });
});
test("a remap onto different bytes already at the destination is refused", async () => {
  const projection: ShareDatabaseProjection = { ...PROJECTION, media: [...PROJECTION.media, { storageKey: "source", destinationStorageKey: "destination" }, { storageKey: "destination" }] };
  await assert.rejects(verify(archive({ content: MOVE_CONTENT }), { projection }), INVALID("Conflicting imported document blob keys."));
});
test("a remap moves the bytes to the destination key and drops the source key", async () => {
  const projection: ShareDatabaseProjection = { ...PROJECTION, media: [...PROJECTION.media, { storageKey: "source", destinationStorageKey: "moved" }, { storageKey: "destination", destinationStorageKey: "destination" }] };
  const result = await verify(archive({ content: MOVE_CONTENT }), { projection });
  assert.deepEqual([...result.files].filter(([path]) => path.startsWith("uploads/")), [["uploads/m1", MEDIA], ["uploads/destination", Buffer.from("two")], ["uploads/moved", Buffer.from("one")]]);
});
test("the projected database counts toward the 300 MiB expanded cap", async () => {
  await assert.rejects(verify(archive(), { projection: { ...PROJECTION, bytes: Buffer.allocUnsafeSlow(SHARE_LIMITS.maxExpandedBytes + 1) } }), { code: "LIMIT_EXCEEDED", message: "Share exceeds the v1 300 MiB expanded cap. Reduce the site or wait for streaming exports." });
});

// Document admission port ----------------------------------------------------------------------

test("a document refused with a non-Error value is reported with the generic ingress reason", async () => {
  const admitDocument: DocumentAdmission = async () => { throw "not an Error"; };
  const files = new Map([["uploads/d1", DOC]]);
  await assert.rejects(admitProjectedDocuments({ files, documents: [{ storageKey: "d1", sha256: sha(DOC), originalFilename: "notes.md" }] }, { admitDocument }), INVALID("Invalid Library document: document ingress rejected"));
});
test("the document admission port receives the original filename and the verified bytes", async () => {
  const seen: { filename: string; bytes: Buffer }[] = [];
  const admitDocument: DocumentAdmission = async required => { seen.push(required); };
  await admitProjectedDocuments({ files: new Map([["uploads/d1", DOC]]), documents: [{ storageKey: "d1", sha256: sha(DOC), originalFilename: "notes.md" }] }, { admitDocument });
  assert.deepEqual(seen, [{ filename: "notes.md", bytes: DOC }]);
});
