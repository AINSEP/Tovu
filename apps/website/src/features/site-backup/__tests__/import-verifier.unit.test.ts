import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { verifySiteImport } from "../import-verifier.js";
import { buildArchiveManifest } from "../archive-manifest.js";
import type { ShareDatabaseProjection } from "../share-policy.js";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const schema = { index: 1, tag: "test" };
const blob = Buffer.from("blob"), other = Buffer.from("other"), db = Buffer.from("archive DB");
function verify(projection: ShareDatabaseProjection, same = false) {
  const files = new Map([["content.db", db], ["settings.json", Buffer.from("{}")], ["media/source.bin", blob], ["media/destination.bin", same ? blob : other]]);
  const manifest = Buffer.from(buildArchiveManifest({ schema, site: { name: "Site" }, scopes: { database: true, media: true, themes: true, plugins: true, settings: true }, plugins: [], media: [...files].filter(([path]) => path.startsWith("media/")).map(([path, bytes]) => ({ id: path, slug: path, path, sha256: sha(bytes) })), files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) })) }));
  files.set("manifest.json", manifest);
  const reader: AgentPluginArchiveReaderPort = { async *entries() { for (const [entryPath, bytes] of files) yield { kind: "file", entryPath, declaredSize: bytes.length, async *openReadStream() { yield bytes; } }; } };
  return verifySiteImport({ archive: Buffer.alloc(0), reader, schema, sanitize: async ({ snapshot }) => { assert.deepEqual(snapshot, db); return projection; } }, { packageFiles: new Map() });
}
test("verified media moves only after hash checks, and conflicting destination claims refuse", async () => {
  const projection = { bytes: Buffer.from("fresh"), media: [{ storageKey: "source", sha256: sha(blob), destinationStorageKey: "moved" }, { storageKey: "destination", sha256: sha(other) }] };
  const result = await verify(projection);
  assert.deepEqual(result.files.get("uploads/moved"), blob);
  assert.deepEqual(result.files.get("uploads/destination"), other);
  assert.equal(result.files.has("uploads/source"), false);
  await assert.rejects(verify({ ...projection, media: [{ ...projection.media[0]!, destinationStorageKey: "destination" }, projection.media[1]!] }), /Conflicting/);
});
test("two media items sharing exact bytes may share the recipient blob", async () => {
  const result = await verify({ bytes: Buffer.from("fresh"), media: [{ storageKey: "source", sha256: sha(blob), destinationStorageKey: "destination" }, { storageKey: "destination", sha256: sha(blob) }] }, true);
  assert.deepEqual(result.files.get("uploads/destination"), blob);
  assert.equal([...result.files.keys()].filter(path => path.startsWith("uploads/")).length, 1);
});
