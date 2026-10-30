/** Verifier boundary contract: no source DDL or extraction before bounded inventory verification. */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { AgentPluginArchiveEntry, AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { verifySiteImport } from "../import-verifier.js";
import { SHARE_LIMITS, type ShareDatabaseProjection, type ShareDatabaseSanitizer } from "../share-policy.js";
import { admitProjectedDocuments, type DocumentAdmission } from "../import-verifier-projection.js";
// The reader contract permits absent sizes and partial streams. Model those adapter
// outcomes directly; real ZIP decoding and preflight are exercised in import-malicious.
const schema = { index: 7, tag: "schema" };
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const db = Buffer.from("archive database"), media = Buffer.from("media bytes");
const content = new Map<string, Buffer>([["content.db", db], ["settings.json", Buffer.from("{}")], ["media/photo.bin", media]]);
const projection: ShareDatabaseProjection = { bytes: Buffer.from("fresh DB"), media: [{ storageKey: "blob", sha256: sha(media) }] };
function file(entryPath: string, bytes: Buffer, declaredSize: number | undefined = bytes.length): Extract<AgentPluginArchiveEntry, { kind: "file" }> {
  return { kind: "file", entryPath, declaredSize, async *openReadStream() { yield bytes; } };
}
function manifest(overrides = {}, files = content): any {
  return { formatVersion: 2, profile: "share", schema, site: { name: "  Portable  " }, scopes: { database: true, media: true, themes: true, plugins: true, settings: true },
    media: [{ id: "photo", slug: "photo", path: "media/photo.bin", sha256: sha(media) }], plugins: [],
    files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) })), ...overrides };
}
function entries(value = manifest(), files = content): AgentPluginArchiveEntry[] {
  return [file("manifest.json", Buffer.from(JSON.stringify(value))), ...[...files].map(([path, bytes]) => file(path, bytes))];
}
function verify(items: readonly AgentPluginArchiveEntry[], options: { projection?: ShareDatabaseProjection; beforeSanitize?: () => void; archive?: Buffer; signal?: AbortSignal } = {}) {
  const reader: AgentPluginArchiveReaderPort = { async *entries() { yield* items; } };
  return verifySiteImport({ archive: options.archive ?? Buffer.alloc(0), reader, schema, sanitize: async ({ snapshot }) => { options.beforeSanitize?.(); assert.deepEqual(snapshot, db); return options.projection ?? projection; } }, { signal: options.signal, packageFiles: new Map() });
}
/** Every refusal names its exact code and message, so a TypeError can never pass for one. */
async function refuses(items: readonly AgentPluginArchiveEntry[], expected: { code: string; message: string | RegExp }): Promise<void> {
  let sanitized = false;
  await assert.rejects(verify(items, { beforeSanitize: () => { sanitized = true; } }), expected);
  assert.equal(sanitized, false);
}
const INVALID = (message: string | RegExp) => ({ code: "INVALID_ARCHIVE", message });
const BAD_MANIFEST = INVALID("Invalid v2 share manifest, inventory or schema identity.");
const NO_MANIFEST = INVALID(/^A v2 manifest\.json at root/);
const INVENTORY_DIFFERS = INVALID("ZIP inventory differs from the manifest.");
const dir = (entryPath: string): AgentPluginArchiveEntry => ({ kind: "directory", entryPath });
const withFiles = (files: unknown[]) => entries(manifest({ files }));
const records = () => manifest().files as { path: string; bytes: number; sha256: string }[];
function readerOf(items: readonly AgentPluginArchiveEntry[], onEntry?: (index: number) => void): AgentPluginArchiveReaderPort {
  return { async *entries() { for (const [index, entry] of items.entries()) { onEntry?.(index); yield entry; } } };
}
function verifyWith(items: readonly AgentPluginArchiveEntry[], options: { sanitize?: ShareDatabaseSanitizer; signal?: AbortSignal; reader?: AgentPluginArchiveReaderPort } = {}) {
  return verifySiteImport({ archive: Buffer.alloc(0), reader: options.reader ?? readerOf(items), schema, sanitize: options.sanitize ?? (async () => projection) }, { signal: options.signal, packageFiles: new Map() });
}

test("v2 returns a fresh projection and maps the single media copy to its blob key", async () => {
  const result = await verify(entries());
  assert.equal(result.name, "Portable");
  assert.deepEqual(result.database, projection.bytes);
  assert.deepEqual(result.files.get("uploads/blob"), media);
  assert.equal(result.files.has("media/photo.bin"), false);
  assert.deepEqual(result.warnings, []);
});
test("v1 and incompatible identities refuse before the database owner", async () => {
  for (const overrides of [{ formatVersion: 1 }, { profile: "backup" }, { schema: { ...schema, index: 8 } }, { schema: { ...schema, tag: "other" } }, { site: null }, { site: { name: " " } }, { site: { name: "x".repeat(201) } }, { files: null }, { media: null }, { plugins: null }]) {
    await refuses(entries(manifest(overrides)), BAD_MANIFEST);
  }
  for (const bytes of [Buffer.from("{"), Buffer.from("null")]) await refuses([file("manifest.json", bytes)], BAD_MANIFEST);
  await refuses(entries().filter(entry => entry.entryPath !== "manifest.json"), NO_MANIFEST);
});
test("unlisted, missing, self-listed and duplicate files refuse", async () => {
  await refuses([...entries(), file("themes/site/extra.txt", Buffer.from("x"))], INVENTORY_DIFFERS);
  await refuses(entries().filter(entry => entry.entryPath !== "settings.json"), INVENTORY_DIFFERS);
  const rows: [unknown, { code: string; message: string | RegExp }][] = [
    [{ path: "manifest.json", bytes: 1, sha256: "a".repeat(64) }, BAD_MANIFEST],
    [manifest().files[0], { code: "UNSAFE_PATH", message: "Duplicate file or file/directory collision." }],
    [{ path: "content.db", bytes: -1, sha256: "bad" }, BAD_MANIFEST],
  ];
  for (const [row, expected] of rows) await refuses(entries(manifest({ files: [...manifest().files, row] })), expected);
});
test("private paths, path traversal, aliases and file/directory collisions refuse", async () => {
  const UNSAFE = (path: string) => ({ code: "UNSAFE_PATH", message: new RegExp(`^Share path '${path.replace(/[\\.^$|?*+()[\]{}]/g, "\\$&")}' is unsafe`) });
  const paths: [string, { code: string; message: string | RegExp }][] = [
    ["../outside", UNSAFE("../outside")], ["/absolute", UNSAFE("/absolute")], ["C:/drive", UNSAFE("C:/drive")], ["themes/a\\b", UNSAFE("themes/a\\b")],
    ["themes/%2e/a", UNSAFE("themes/%2e/a")], ["themes/e\u0301.txt", UNSAFE("themes/e\u0301.txt")], ["themes/CON.txt", UNSAFE("themes/CON.txt")],
    ["themes/trailing.", UNSAFE("themes/trailing.")], ["themes/site/.env", UNSAFE("themes/site/.env")], ["themes/site/key.pem", UNSAFE("themes/site/key.pem")],
    // Outside the v2 tree: the manifest contract refuses these before any path claim.
    ["uploads/private", BAD_MANIFEST], ["database/content.db", BAD_MANIFEST],
  ];
  for (const [path, expected] of paths) {
    const files = new Map(content); files.set(path, Buffer.from("x"));
    await refuses(entries(manifest({}, files), files), expected);
  }
  const ALIAS = { code: "UNSAFE_PATH", message: "ZIP contains unsafe case or Unicode aliases." };
  const collisions: [string[], { code: string; message: string }][] = [
    [["themes/A.txt", "themes/a.txt"], ALIAS], [["themes/Dir/a", "themes/dir/b"], ALIAS], [["themes/SS/a", "themes/ß/b"], ALIAS],
    [["themes/x", "themes/x/y"], { code: "UNSAFE_PATH", message: "ZIP file/directory collision." }],
  ];
  for (const [names, expected] of collisions) await refuses([...entries(), ...names.map(path => file(path, Buffer.from("x")))], expected);
  await refuses([...entries(), { kind: "symlink", entryPath: "themes/link", target: "../escape" } as AgentPluginArchiveEntry], INVALID("ZIP links and special entries are forbidden."));
});
test("declared and expanded sizes are bounded before buffering", async () => {
  for (const item of [{ ...file("manifest.json", Buffer.from("{}")), declaredSize: undefined }, file("manifest.json", Buffer.from("short"), 10), file("manifest.json", Buffer.alloc(SHARE_LIMITS.maxManifestBytes + 1), 1)]) await refuses([item], INVALID(/^(?:ZIP declared and actual size differ|Expanded ZIP bytes exceed)/));
  const tooLarge = [...entries(), file("themes/site/large.txt", Buffer.alloc(0), SHARE_LIMITS.maxFileBytes + 1)];
  await refuses(tooLarge, { code: "LIMIT_EXCEEDED", message: "Share file 'themes/site/large.txt' exceeds the 64 MiB ordinary-file cap." });
  await refuses(Array.from({ length: 2001 }, (_, n) => file("themes/site/" + n, Buffer.alloc(0))), INVALID("Import exceeds the 2,000-entry cap."));
  await assert.rejects(verify(entries(), { archive: Buffer.allocUnsafeSlow(SHARE_LIMITS.maxArchiveBytes + 1) }), INVALID("Import exceeds the 300 MiB archive cap."));
});
test("database and media edits refuse while code edits warn and quarantine the whole unit", async () => {
  for (const path of ["content.db", "media/photo.bin", "settings.json"]) {
    const changed = new Map(content); changed.set(path, Buffer.from("changed"));
    await refuses(entries(manifest(), changed), INVALID("ZIP size mismatch."));
  }
  const files = new Map(content); files.set("themes/site/theme.json", Buffer.from('{"tier":"static"}')); files.set("themes/site/index.html", Buffer.from("original"));
  const value = manifest({}, files); files.set("themes/site/index.html", Buffer.from("edited and longer"));
  const result = await verify(entries(value, files));
  assert.deepEqual([...result.modified], ["themes/site"]);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.files.get("themes/static/site/index.html")!.toString(), "edited and longer");
});
test("source credentials refuse even in otherwise editable code", async () => {
  const files = new Map(content); files.set("themes/site/code.js", Buffer.from('const key = "gh' + 'p_' + "x".repeat(36) + '";'));
  await refuses(entries(manifest({}, files), files), { code: "SECRET_IN_CONTENT", message: "Share refused: 'themes/site/code.js' contains credential-shaped content. Remove the secret before sharing." });
});
test("a credential in an imported agent-plugin package names its archive path, not the scan path", async () => {
  const files = new Map(content); files.set("agent-plugins/a/package/targets/deploy.mjs", Buffer.from('const key = "gh' + 'p_' + "x".repeat(36) + '";'));
  const plugins = [{ kind: "agent", id: "a", version: "1.0.0", digest: "b".repeat(64), enabled: false, shipped: true }];
  await refuses(entries(manifest({ plugins }, files), files), { code: "SECRET_IN_CONTENT", message: "Share refused: 'agent-plugins/a/package/targets/deploy.mjs' contains credential-shaped content. Remove the secret before sharing." });
});
test("projection media and document admission cannot be granted by ZIP checksums", async () => {
  await assert.rejects(verify(entries(), { projection: { ...projection, media: [{ storageKey: "other", sha256: "0".repeat(64) }] } }), /not referenced/);
  const doc = Buffer.from("# Notes\n"), sha256 = sha(doc), documents = [{ storageKey: "doc", sha256, originalFilename: "notes.md" }];
  await assert.rejects(admitProjectedDocuments({ files: new Map(), documents }), /missing or corrupt/);
  await assert.rejects(admitProjectedDocuments({ files: new Map([["uploads/doc", doc]]), documents }, { admitDocument: async () => { throw new Error("policy refused"); } }), /Invalid Library document/);
  await admitProjectedDocuments({ files: new Map([["uploads/doc", doc]]), documents });
});

// Restored per-case refusals (Opus check 2026-10-26): every branch the v1 suite pinned that still
// exists in v2, each with its exact code and message.

// Success shape -------------------------------------------------------------------------------

test("the sanitizer receives the archived database snapshot and the caller's abort signal", async () => {
  const calls: { snapshot: Buffer; signal: AbortSignal | undefined }[] = [], signal = new AbortController().signal;
  await verifyWith(entries(), { signal, sanitize: async (required, optional) => { calls.push({ snapshot: required.snapshot, signal: optional?.signal }); return projection; } });
  assert.deepEqual(calls, [{ snapshot: db, signal }]);
});
test("every recognised portable root and the settings file are admitted", async () => {
  const files = new Map(content);
  for (const path of ["themes/site/index.html", "themes/__overrides__/site.css", "skills/s/SKILL.md", "plugins/p/memory/notes/n.md", "agent-plugins/a/memory/learned/l.md"]) files.set(path, Buffer.from("plain"));
  const result = await verify(entries(manifest({}, files), files));
  assert.deepEqual([...result.files.keys()].sort(), ["agent-plugins/a/memory/learned/l.md", "overrides/site.css", "plugins/p/memory/notes/n.md", "settings.json", "skills/s/SKILL.md", "themes/untrusted/site/index.html", "uploads/blob"]);
});
test("the database snapshot is exempt from the content secret scan", async () => {
  const secretDb = Buffer.from(("g" + "hp_") + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8");
  const files = new Map(content); files.set("content.db", secretDb);
  const result = await verifySiteImport({ archive: Buffer.alloc(0), reader: readerOf(entries(manifest({}, files), files)), schema, sanitize: async () => projection }, { packageFiles: new Map() });
  assert.deepEqual(result.database, projection.bytes);
});
test("a site name of exactly 200 characters is accepted", async () => {
  assert.equal((await verify(entries(manifest({ site: { name: "x".repeat(200) } })))).name, "x".repeat(200));
});
test("a directory entry with listed files below it is accepted", async () => {
  assert.equal((await verify([dir("media/"), ...entries()])).name, "Portable");
});

// Abort points --------------------------------------------------------------------------------

test("an already-aborted signal stops before the archive is read", async () => {
  const reason = new Error("stopped before reading");
  let read = false;
  await assert.rejects(verifyWith([], { signal: AbortSignal.abort(reason), reader: { async *entries() { read = true; } } }), reason);
  assert.equal(read, false);
});
test("an abort between metadata entries stops the first pass", async () => {
  const controller = new AbortController(), reason = new Error("stopped between entries");
  await assert.rejects(verifyWith([], { signal: controller.signal, reader: readerOf(entries(), index => { if (index === 1) controller.abort(reason); }) }), reason);
});
test("an abort while the manifest streams stops the bounded read", async () => {
  const controller = new AbortController(), reason = new Error("stopped in manifest");
  const items = entries().map(entry => entry.entryPath === "manifest.json" ? streamed(entry, () => controller.abort(reason)) : entry);
  await assert.rejects(verifyWith(items, { signal: controller.signal }), reason);
});
test("an abort while a listed file streams stops the second pass", async () => {
  const controller = new AbortController(), reason = new Error("stopped in content");
  const items = entries().map(entry => entry.entryPath === "content.db" ? streamed(entry, () => controller.abort(reason)) : entry);
  await assert.rejects(verifyWith(items, { signal: controller.signal }), reason);
});
test("an abort before document admission stops the document loop", async () => {
  const controller = new AbortController(), reason = new Error("stopped before documents");
  const doc = documentArchive();
  await assert.rejects(verifyWith(doc.items, { signal: controller.signal, sanitize: async () => { controller.abort(reason); return doc.projection; } }), reason);
});
/** The same entry, calling `onRead` when its bytes start streaming. */
function streamed(entry: AgentPluginArchiveEntry, onRead: () => void): AgentPluginArchiveEntry {
  const inner = entry as Extract<AgentPluginArchiveEntry, { kind: "file" }>;
  return { ...inner, async *openReadStream(options) { onRead(); yield* inner.openReadStream(options); } };
}

// First pass: metadata ------------------------------------------------------------------------

test("an archive over 300 MiB is refused before any entry is read", async () => {
  let read = false;
  await assert.rejects(verifySiteImport({ archive: Buffer.allocUnsafeSlow(SHARE_LIMITS.maxArchiveBytes + 1), reader: { async *entries() { read = true; } }, schema, sanitize: async () => projection }), INVALID("Import exceeds the 300 MiB archive cap."));
  assert.equal(read, false);
});
test("the 2,001st entry is refused", async () => {
  await refuses(Array.from({ length: SHARE_LIMITS.maxFiles + 1 }, (_, n) => file("themes/site/f-" + n, Buffer.alloc(0))), INVALID("Import exceeds the 2,000-entry cap."));
});
for (const kind of ["symlink", "hardlink", "device", "fifo"] as const) {
  test(`a ${kind} entry is refused`, async () => {
    await refuses([...entries(), { kind, entryPath: "themes/link" } as AgentPluginArchiveEntry], INVALID("ZIP links and special entries are forbidden."));
  });
}
test("an unsafe entry path is refused by the path claim", async () => {
  await refuses([...entries(), file("themes/CON.txt", Buffer.alloc(0))], { code: "UNSAFE_PATH", message: "Share path 'themes/CON.txt' is unsafe." });
});
test("a repeated directory is refused", async () => {
  await refuses([...entries(), dir("themes/"), dir("themes/")], INVALID("Duplicate directory or file/directory collision."));
});
test("a directory after a file of the same name is refused", async () => {
  await refuses([...entries(), file("themes/x", Buffer.alloc(0)), dir("themes/x/")], INVALID("Duplicate directory or file/directory collision."));
});
test("a file after a directory of the same name is refused", async () => {
  await refuses([...entries(), dir("themes/x/"), file("themes/x", Buffer.alloc(0))], INVALID("ZIP file/directory collision."));
});
for (const [label, declared] of [["absent", undefined], ["negative", -1], ["fractional", 1.5]] as const) {
  test(`an ${label} declared size is refused`, async () => {
    await refuses([...entries(), { ...file("themes/a", Buffer.alloc(0)), declaredSize: declared }], INVALID("ZIP has an invalid declared size."));
  });
}
test("a declared file over 64 MiB is refused from metadata alone", async () => {
  await refuses([...entries(), file("themes/big", Buffer.alloc(0), SHARE_LIMITS.maxFileBytes + 1)], { code: "LIMIT_EXCEEDED", message: "Share file 'themes/big' exceeds the 64 MiB ordinary-file cap." });
});
test("a manifest stream longer than the 2 MiB manifest cap is refused as a possible ZIP bomb", async () => {
  await refuses([file("manifest.json", Buffer.alloc(SHARE_LIMITS.maxManifestBytes + 1), 1), ...entries().slice(1)], INVALID("Expanded ZIP bytes exceed the manifest or archive cap (possible ZIP bomb)."));
});
test("a manifest stream shorter than its declared size is refused", async () => {
  await refuses([file("manifest.json", Buffer.from("{}"), 10), ...entries().slice(1)], INVALID("ZIP declared and actual size differ."));
});
test("an archive without the root manifest is refused", async () => {
  await refuses(entries().slice(1), NO_MANIFEST);
});
test("a manifest that is not JSON is refused", async () => {
  await refuses([file("manifest.json", Buffer.from("{")), ...entries().slice(1)], BAD_MANIFEST);
});

// Manifest identity ---------------------------------------------------------------------------

const IDENTITY_CASES: readonly [string, unknown][] = [
  ["a null manifest", null], ["a numeric manifest", 5], ["format version 1", manifest({ formatVersion: 1 })],
  ["the backup profile", manifest({ profile: "backup" })], ["a missing schema", manifest({ schema: undefined })],
  ["another schema index", manifest({ schema: { ...schema, index: 8 } })], ["another schema tag", manifest({ schema: { ...schema, tag: "forged" } })],
  ["a missing scope", manifest({ scopes: { database: true, media: true, themes: true, plugins: true } })],
  ["a non-array file list", manifest({ files: {} })], ["a 2,000-record file list", manifest({ files: Array(SHARE_LIMITS.maxFiles).fill(records()[0]) })],
  ["a non-array media list", manifest({ media: {} })], ["a non-array plugin list", manifest({ plugins: {} })],
  ["a missing site", manifest({ site: undefined })], ["a non-string site name", manifest({ site: { name: 42 } })],
  ["a blank site name", manifest({ site: { name: "  " } })], ["a 201-character site name", manifest({ site: { name: "x".repeat(201) } })],
];
for (const [label, value] of IDENTITY_CASES) {
  test(`a manifest with ${label} is refused`, async () => { await refuses([file("manifest.json", Buffer.from(JSON.stringify(value))), ...entries().slice(1)], BAD_MANIFEST); });
}

// Manifest inventory ---------------------------------------------------------------------------

const INVALID_RECORDS: readonly [string, (row: Record<string, unknown>) => unknown][] = [
  ["a null record", () => null], ["a non-string path", row => ({ ...row, path: 4 })], ["a fractional size", row => ({ ...row, bytes: 0.5 })],
  ["a negative size", row => ({ ...row, bytes: -1 })], ["a missing size", row => ({ ...row, bytes: undefined })],
  ["an uppercase hash", row => ({ ...row, sha256: String(row.sha256).toUpperCase() })], ["a missing hash", row => ({ ...row, sha256: undefined })],
];
for (const [label, bad] of INVALID_RECORDS) {
  test(`a manifest file list with ${label} is refused`, async () => { await refuses(withFiles([...records(), bad({ ...records()[1] })]), BAD_MANIFEST); });
}
test("an unsafe manifest path is refused by the share path policy", async () => {
  await refuses(withFiles([...records(), { ...records()[1], path: "themes/CON.txt" }]), { code: "UNSAFE_PATH", message: "Share path 'themes/CON.txt' is unsafe." });
});
test("a repeated manifest path is refused", async () => {
  await refuses(withFiles([...records(), records()[1]]), { code: "UNSAFE_PATH", message: "Duplicate file or file/directory collision." });
});
test("a manifest that lists itself is refused", async () => {
  await refuses(withFiles([...records(), { ...records()[1], path: "manifest.json" }]), BAD_MANIFEST);
});
for (const path of ["unknown/content.txt", "settings/other.json", "themes", "uploads/chat-attachments/a.png", "database/content.db"]) {
  test(`the manifest path ${JSON.stringify(path)} is refused as outside the v2 tree`, async () => {
    await refuses(withFiles([...records(), { ...records()[1], path }]), BAD_MANIFEST);
  });
}
test("a manifest without the database record is refused", async () => {
  await refuses(withFiles(records().filter(row => row.path !== "content.db")), BAD_MANIFEST);
});
test("a suspicious manifest path is refused as private", async () => {
  await refuses(withFiles([...records(), { ...records()[1], path: "themes/vault.txt" }]), { code: "UNSAFE_FILE", message: "Share refuses suspicious required path 'themes/vault.txt'. Remove it before sharing." });
});
test("a manifest listing more files than the archive holds is refused", async () => {
  await refuses(withFiles([...records(), { ...records()[1], path: "themes/ghost" }]), INVALID("ZIP inventory differs from the manifest."));
});
test("a directory with no listed file below it is refused", async () => {
  await refuses([...entries(), dir("skills/")], INVALID("Unlisted ZIP directory."));
});

// Second pass: content -------------------------------------------------------------------------

test("an archive file missing from the manifest is refused while reading content", async () => {
  const listed = new Map(content); listed.set("themes/b", Buffer.from("a"));
  const shipped = new Map(content); shipped.set("themes/a", Buffer.from("a"));
  await refuses(entries(manifest({}, listed), shipped), INVALID("Unlisted ZIP file."));
});
test("a data file whose declared size differs from the manifest is refused", async () => {
  await refuses(withFiles(records().map(row => row.path === "settings.json" ? { ...row, bytes: row.bytes + 1 } : row)), INVALID("ZIP size mismatch."));
});
test("data content whose SHA-256 differs from the manifest is refused", async () => {
  await refuses(withFiles(records().map(row => row.path === "settings.json" ? { ...row, sha256: "0".repeat(64) } : row)), INVALID("ZIP size or SHA-256 mismatch."));
});
test("a content stream longer than its declared size is refused as a possible ZIP bomb", async () => {
  const items = entries().map(entry => entry.entryPath === "content.db" ? file("content.db", Buffer.concat([db, Buffer.from("!")]), db.length) : entry);
  await refuses(items, INVALID("Expanded ZIP bytes exceed the manifest or archive cap (possible ZIP bomb)."));
});
test("a content stream shorter than its declared size is refused", async () => {
  const items = entries().map(entry => entry.entryPath === "content.db" ? file("content.db", db.subarray(1), db.length) : entry);
  await refuses(items, INVALID("ZIP declared and actual size differ."));
});
test("credential-shaped content in a listed file is refused", async () => {
  const files = new Map(content); files.set("themes/site/leak.txt", Buffer.from(("token g" + "hp_") + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"));
  await refuses(entries(manifest({}, files), files), { code: "SECRET_IN_CONTENT", message: "Share refused: 'themes/site/leak.txt' contains credential-shaped content. Remove the secret before sharing." });
});

// Projection: media -----------------------------------------------------------------------------

test("archive media the projected database does not reference is refused", async () => {
  await assert.rejects(verify(entries(), { projection: { ...projection, media: [{ storageKey: "other", sha256: "0".repeat(64) }] } }), INVALID("Archive media is not referenced by the projected database."));
});
test("a referenced media key that is not a safe path is refused", async () => {
  await assert.rejects(verify(entries(), { projection: { ...projection, media: [{ storageKey: "CON.txt", sha256: sha(media) }] } }), { code: "UNSAFE_PATH", message: "Share path 'uploads/CON.txt' is unsafe." });
});
test("referenced media missing from the archive is refused", async () => {
  await assert.rejects(verify(entries(), { projection: { ...projection, media: [...projection.media, { storageKey: "absent", sha256: "0".repeat(64) }] } }), INVALID("Referenced media is missing or failed its hash."));
});
test("a missing media blob that backs a document is refused as a document blob", async () => {
  const value: ShareDatabaseProjection = { ...projection, media: [...projection.media, { storageKey: "d1" }], documents: [{ storageKey: "d1", sha256: sha(media), originalFilename: "notes.md" }] };
  await assert.rejects(verify(entries(), { projection: value }), INVALID("Referenced document blob is missing or corrupt."));
});

// Projection: documents -----------------------------------------------------------------------

/** A root archive holding one Library document, `media/notes.md`, and the projection that names it. */
function documentArchive(document: { sha256?: string; originalFilename?: string; storageKey?: string } = {}) {
  const doc = Buffer.from("# Notes\n"), files = new Map(content); files.set("media/notes.md", doc);
  const value = manifest({ media: [...manifest().media, { id: "doc", slug: "notes", path: "media/notes.md", sha256: sha(doc) }] }, files);
  const docProjection: ShareDatabaseProjection = { ...projection, media: [...projection.media, { storageKey: "d1", sha256: sha(doc) }], documents: [{ storageKey: document.storageKey ?? "d1", sha256: document.sha256 ?? sha(doc), originalFilename: document.originalFilename ?? "notes.md" }] };
  return { doc, items: entries(value, files), projection: docProjection };
}
test("a valid Library document is admitted", async () => {
  const archive = documentArchive();
  assert.deepEqual((await verify(archive.items, { projection: archive.projection })).files.get("uploads/d1"), archive.doc);
});
test("a document whose blob is not in the archive is refused", async () => {
  const archive = documentArchive({ storageKey: "d2" });
  await assert.rejects(verify(archive.items, { projection: archive.projection }), INVALID("Referenced document blob is missing or corrupt."));
});
test("a document whose blob hash differs is refused", async () => {
  const archive = documentArchive({ sha256: "0".repeat(64) });
  await assert.rejects(verify(archive.items, { projection: archive.projection }), INVALID("Referenced document blob is missing or corrupt."));
});
test("a document the upload policy rejects is refused with the policy's reason", async () => {
  const archive = documentArchive({ originalFilename: "notes.pdf" });
  await assert.rejects(verify(archive.items, { projection: archive.projection }), INVALID(/^Invalid Library document: \S/));
});

// Projection: destination remaps and the final cap ---------------------------------------------

/** Two archive media copies with different bytes, so a remap can collide with real content. */
function moveArchive(moves: readonly { storageKey: string; destinationStorageKey?: string; bytes: Buffer }[]) {
  const files = new Map<string, Buffer>(content), rows = [...manifest().media];
  for (const [index, move] of moves.entries()) { files.set(`media/move-${index}.bin`, move.bytes); rows.push({ id: "move-" + index, slug: "move-" + index, path: `media/move-${index}.bin`, sha256: sha(move.bytes) }); }
  const value: ShareDatabaseProjection = { ...projection, media: [...projection.media, ...moves.map(({ storageKey, destinationStorageKey, bytes }) => ({ storageKey, sha256: sha(bytes), ...(destinationStorageKey ? { destinationStorageKey } : {}) }))] };
  return { items: entries(manifest({ media: rows }, files), files), projection: value };
}
test("a remapped destination that is not a safe path is refused", async () => {
  const archive = moveArchive([{ storageKey: "source", destinationStorageKey: "CON.txt", bytes: Buffer.from("one") }]);
  await assert.rejects(verify(archive.items, { projection: archive.projection }), { code: "UNSAFE_PATH", message: "Share path 'uploads/CON.txt' is unsafe." });
});
test("a remap onto different bytes already at the destination is refused", async () => {
  const archive = moveArchive([{ storageKey: "source", destinationStorageKey: "destination", bytes: Buffer.from("one") }, { storageKey: "destination", bytes: Buffer.from("two") }]);
  await assert.rejects(verify(archive.items, { projection: archive.projection }), INVALID("Conflicting imported document blob keys."));
});
test("a remap moves the bytes to the destination key and drops the source key", async () => {
  const archive = moveArchive([{ storageKey: "source", destinationStorageKey: "moved", bytes: Buffer.from("one") }, { storageKey: "destination", destinationStorageKey: "destination", bytes: Buffer.from("two") }]);
  const result = await verify(archive.items, { projection: archive.projection });
  assert.deepEqual([...result.files].filter(([path]) => path.startsWith("uploads/")).sort(), [["uploads/blob", media], ["uploads/destination", Buffer.from("two")], ["uploads/moved", Buffer.from("one")]]);
});
test("the projected database counts toward the 300 MiB expanded cap", async () => {
  await assert.rejects(verify(entries(), { projection: { ...projection, bytes: Buffer.allocUnsafeSlow(SHARE_LIMITS.maxExpandedBytes + 1) } }), { code: "LIMIT_EXCEEDED", message: "Share exceeds the 300 MiB expanded cap. Reduce the site or wait for streaming exports." });
});

// Document admission port ----------------------------------------------------------------------

test("a document refused with a non-Error value is reported with the generic ingress reason", async () => {
  const admitDocument: DocumentAdmission = async () => { throw "not an Error"; };
  const doc = Buffer.from("# Notes\n");
  await assert.rejects(admitProjectedDocuments({ files: new Map([["uploads/d1", doc]]), documents: [{ storageKey: "d1", sha256: sha(doc), originalFilename: "notes.md" }] }, { admitDocument }), INVALID("Invalid Library document: document ingress rejected"));
});
test("the document admission port receives the original filename and the verified bytes", async () => {
  const seen: { filename: string; bytes: Buffer }[] = [], doc = Buffer.from("# Notes\n");
  await admitProjectedDocuments({ files: new Map([["uploads/d1", doc]]), documents: [{ storageKey: "d1", sha256: sha(doc), originalFilename: "notes.md" }] }, { admitDocument: async required => { seen.push(required); } });
  assert.deepEqual(seen, [{ filename: "notes.md", bytes: doc }]);
});
