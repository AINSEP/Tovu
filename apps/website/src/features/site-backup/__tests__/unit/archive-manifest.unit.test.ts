import test from "node:test";
import assert from "node:assert/strict";
import { buildArchiveManifest, parseArchiveManifest } from "../../archive-manifest.js";
import { SHARE_LIMITS, SHARE_VERSION_MISMATCH_MESSAGE } from "../../share-policy.js";
import { runtimeSchemaVersion } from "#src/platform/site-dir/index";
const schema = { index: 1, tag: "test" };
const hash = "a".repeat(64);
const input = { schema, site: { name: "Portable" }, scopes: { database: true, media: true, themes: true, plugins: true, settings: true }, media: [], plugins: [], files: ["content.db", "settings.json"].map(path => ({ path, bytes: 1, sha256: hash })) };
const parse = (value: unknown) => parseArchiveManifest({ bytes: Buffer.from(JSON.stringify(value)), schema });
test("v2 contract round-trips and excludes its own manifest", () => {
  const manifest = parseArchiveManifest({ bytes: Buffer.from(buildArchiveManifest(input)), schema });
  assert.deepEqual(manifest, { formatVersion: 2, profile: "share", ...input });
});
test("v1, schema mismatch, duplicate aliases and bad hashes refuse", () => {
  for (const extra of [{ formatVersion: 1 }, { schema: { ...schema, tag: "other" } }, { files: [...input.files, input.files[0]] }, { files: [...input.files, { path: "MEDIA/X.png", bytes: 1, sha256: "bad" }] }]) {
    assert.throws(() => parse({ formatVersion: 2, profile: "share", ...input, ...extra }));
  }
});
test("duplicate media and plugin identities cannot claim separate files", () => {
  const media = { id: "m", slug: "photo", path: "media/photo.webp", sha256: hash };
  assert.throws(() => parse({ formatVersion: 2, profile: "share", ...input, files: [...input.files, { ...media, bytes: 1 }], media: [media, media] }));
});

test("plugin records are unique and cover every shipped package", () => {
  const plugin = { kind: "agent", id: "demo", version: "1.0.0", digest: hash, enabled: true, shipped: true };
  const files = [...input.files, { path: "agent-plugins/demo/package/plugin.json", bytes: 1, sha256: hash }];
  assert.throws(() => parse({ formatVersion: 2, profile: "share", ...input, files, plugins: [plugin, plugin] }));
  assert.throws(() => parse({ formatVersion: 2, profile: "share", ...input, files, plugins: [] }));
});

// Host values bound into the manifest contract: pinned here so the binding cannot drift from Tovu's caps and copy.
test("the persisted manifest bytes are two-space JSON with a trailing newline and the fixed identity first", () => {
  const small = { schema, site: { name: "Portable" }, scopes: input.scopes, media: [], plugins: [], files: input.files };
  const expected = JSON.stringify({ formatVersion: 2, profile: "share", ...small }, null, 2) + "\n";
  assert.equal(buildArchiveManifest(small), expected);
  assert.ok(expected.startsWith('{\n  "formatVersion": 2,\n  "profile": "share",\n  "schema": {'));
});
test("a manifest over the host manifest cap refuses before it is parsed", () => {
  const padded = Buffer.from(buildArchiveManifest(input) + " ".repeat(SHARE_LIMITS.maxManifestBytes));
  assert.throws(() => parseArchiveManifest({ bytes: padded, schema }), { code: "INVALID_ARCHIVE" });
  assert.doesNotThrow(() => parseArchiveManifest({ bytes: Buffer.from(buildArchiveManifest(input)), schema }));
});
test("the host file cap counts the manifest itself: one entry under passes, at the cap refuses", () => {
  const manifestWith = (count: number) => {
    const extra = Array.from({ length: count - 2 }, (_, index) => ({ id: `m${index}`, slug: `s${index}`, path: `media/m${index}.bin`, sha256: hash }));
    const files = [...input.files, ...extra.map(row => ({ path: row.path, bytes: 1, sha256: hash }))];
    return { ...input, files, media: extra };
  };
  assert.doesNotThrow(() => parse({ formatVersion: 2, profile: "share", ...manifestWith(SHARE_LIMITS.maxFiles - 1) }));
  assert.throws(() => parse({ formatVersion: 2, profile: "share", ...manifestWith(SHARE_LIMITS.maxFiles) }), { code: "INVALID_ARCHIVE" });
});
test("a known build's archive gets the host's re-export advice; an invented schema identity is named as unknown", () => {
  const known = runtimeSchemaVersion();
  const archived = Buffer.from(buildArchiveManifest({ ...input, schema: known }));
  assert.throws(() => parseArchiveManifest({ bytes: archived, schema: { index: known.index + 1, tag: "later" } }), { code: "INVALID_ARCHIVE", message: SHARE_VERSION_MISMATCH_MESSAGE });
  const invented = { index: 987654, tag: "invented" };
  assert.throws(() => parseArchiveManifest({ bytes: Buffer.from(buildArchiveManifest({ ...input, schema: invented })), schema: known }), { code: "INVALID_ARCHIVE", message: 'Unknown archive schema identity {"index":987654,"tag":"invented"}.' });
});
