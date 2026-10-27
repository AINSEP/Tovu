import test from "node:test";
import assert from "node:assert/strict";
import { buildArchiveManifest, parseArchiveManifest } from "../../archive-manifest.js";
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
