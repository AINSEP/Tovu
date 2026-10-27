/** Verifier boundary contract: no source DDL or extraction before bounded inventory verification. */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { AgentPluginArchiveEntry, AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { verifySiteImport } from "../import-verifier.js";
import { SHARE_LIMITS, type ShareDatabaseProjection } from "../share-policy.js";
import { admitProjectedDocuments } from "../import-verifier-projection.js";
// The reader contract permits absent sizes and partial streams. Model those adapter
// outcomes directly; real ZIP decoding and preflight are exercised in import-malicious.
const schema = { index: 7, tag: "schema" };
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const db = Buffer.from("archive database"), media = Buffer.from("media bytes");
const content = new Map([["content.db", db], ["settings.json", Buffer.from("{}")], ["media/photo.bin", media]]);
const projection: ShareDatabaseProjection = { bytes: Buffer.from("fresh DB"), media: [{ storageKey: "blob", sha256: sha(media) }] };
function file(entryPath: string, bytes: Buffer, declaredSize: number | undefined = bytes.length): AgentPluginArchiveEntry {
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
async function refuses(items: readonly AgentPluginArchiveEntry[], code?: string): Promise<void> {
  let sanitized = false;
  await assert.rejects(verify(items, { beforeSanitize: () => { sanitized = true; } }), code ? { code } : undefined);
  assert.equal(sanitized, false);
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
    await refuses(entries(manifest(overrides)), "INVALID_ARCHIVE");
  }
  for (const bytes of [Buffer.from("{"), Buffer.from("null")]) await refuses([file("manifest.json", bytes)], "INVALID_ARCHIVE");
  await refuses(entries().filter(entry => entry.entryPath !== "manifest.json"), "INVALID_ARCHIVE");
});
test("unlisted, missing, self-listed and duplicate files refuse", async () => {
  await refuses([...entries(), file("themes/site/extra.txt", Buffer.from("x"))]);
  await refuses(entries().filter(entry => entry.entryPath !== "settings.json"));
  for (const row of [{ path: "manifest.json", bytes: 1, sha256: "a".repeat(64) }, manifest().files[0], { path: "content.db", bytes: -1, sha256: "bad" }]) {
    await refuses(entries(manifest({ files: [...manifest().files, row] })));
  }
});
test("private paths, path traversal, aliases and file/directory collisions refuse", async () => {
  for (const path of ["../outside", "/absolute", "C:/drive", "themes/a\\b", "themes/%2e/a", "themes/e\u0301.txt", "themes/CON.txt", "themes/trailing.", "themes/site/.env", "themes/site/key.pem", "uploads/private", "database/content.db"]) {
    const files = new Map(content); files.set(path, Buffer.from("x"));
    await refuses(entries(manifest({}, files), files));
  }
  for (const names of [["themes/A.txt", "themes/a.txt"], ["themes/Dir/a", "themes/dir/b"], ["themes/SS/a", "themes/ß/b"], ["themes/x", "themes/x/y"]]) {
    await refuses([...entries(), ...names.map(path => file(path, Buffer.from("x")))]);
  }
  await refuses([...entries(), { kind: "symlink", entryPath: "themes/link", target: "../escape" } as AgentPluginArchiveEntry]);
});
test("declared and expanded sizes are bounded before buffering", async () => {
  for (const item of [{ ...file("manifest.json", Buffer.from("{}")), declaredSize: undefined }, file("manifest.json", Buffer.from("short"), 10), file("manifest.json", Buffer.alloc(SHARE_LIMITS.maxManifestBytes + 1), 1)]) await refuses([item], "INVALID_ARCHIVE");
  const tooLarge = [...entries(), file("themes/site/large.txt", Buffer.alloc(0), SHARE_LIMITS.maxFileBytes + 1)];
  await refuses(tooLarge, "LIMIT_EXCEEDED");
  await refuses(Array.from({ length: 2001 }, (_, n) => file("themes/site/" + n, Buffer.alloc(0))));
  await assert.rejects(verify(entries(), { archive: Buffer.allocUnsafeSlow(SHARE_LIMITS.maxArchiveBytes + 1) }), { code: "INVALID_ARCHIVE" });
});
test("database and media edits refuse while code edits warn and quarantine the whole unit", async () => {
  for (const path of ["content.db", "media/photo.bin", "settings.json"]) {
    const changed = new Map(content); changed.set(path, Buffer.from("changed"));
    await refuses(entries(manifest(), changed));
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
  await refuses(entries(manifest({}, files), files), "SECRET_IN_CONTENT");
});
test("an aborted signal prevents any archive iteration", async () => {
  await assert.rejects(verify(entries(), { signal: AbortSignal.abort(new Error("stopped")) }), /stopped/);
});
test("projection media and document admission cannot be granted by ZIP checksums", async () => {
  await assert.rejects(verify(entries(), { projection: { ...projection, media: [{ storageKey: "other", sha256: "0".repeat(64) }] } }), /not referenced/);
  const doc = Buffer.from("# Notes\n"), sha256 = sha(doc), documents = [{ storageKey: "doc", sha256, originalFilename: "notes.md" }];
  await assert.rejects(admitProjectedDocuments({ files: new Map(), documents }), /missing or corrupt/);
  await assert.rejects(admitProjectedDocuments({ files: new Map([["uploads/doc", doc]]), documents }, { admitDocument: async () => { throw new Error("policy refused"); } }), /Invalid Library document/);
  await admitProjectedDocuments({ files: new Map([["uploads/doc", doc]]), documents });
});
