import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { prepareShareContent } from "../share-preparation.js";
import { SHARE_LIMITS, type ShareDatabaseProjection } from "../share-policy.js";
import { importFixture } from "./import.fixture.js";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";

async function preparation(t: TestContext) {
  const h = await importFixture(t), siteDir = path.join(h.root, "source");
  fs.mkdirSync(siteDir);
  const sources = { siteDir, themesDir: path.join(siteDir, "themes"), skillsDir: path.join(siteDir, "skills"), mediaUploadsDir: null, agentPlugins: resolveAgentPluginLayout({ siteDir: siteDir }, { env: {} }), tovuVersion: "test" };
  const projection: ShareDatabaseProjection = { bytes: Buffer.from("projected"), media: [] };
  const enrich = (value: ShareDatabaseProjection): ShareDatabaseProjection => ({ ...value, archiveMedia: [...new Map(value.media.map(row => [row.storageKey, row])).values()].map(row => ({ ...row, sha256: row.sha256 ?? "", id: row.storageKey, slug: row.storageKey, workspaceId: "ws", kind: value.documents?.some(doc => doc.storageKey === row.storageKey) ? "document" : "media", originalFilename: null })) });
  const ports: Parameters<typeof prepareShareContent>[0] = { snapshotRoot: h.root, sources, sanitize: async () => enrich(projection), rewriteMedia: async ({ bytes }) => bytes, imageTransformer: { transform: async () => assert.fail("not raster") },
    blobStore: { sizeOf: async () => assert.fail("no media"), get: async () => assert.fail("no media") },
    dbOps: { getCapabilities: async () => ({ restorePoint: { kind: "file-snapshot", costClass: "cheap" } }),
      captureRestorePoint: async () => { const artifactRef = path.join(h.root, "snapshot.db"); fs.writeFileSync(artifactRef, "private"); return { artifactRef, watermarkAtCapture: 7 }; }, restoreFromArtifact: async () => assert.fail("export must not restore") } };
  return { ...h, ports, siteDir, projection, enrich };
}

test("preparation reports failed snapshot without sanitizing or reading media", async t => {
  const h = await preparation(t);
  await assert.rejects(prepareShareContent({ ...h.ports, dbOps: { ...h.ports.dbOps, captureRestorePoint: async () => { throw new Error("disk failed"); } }, sanitize: async () => assert.fail("no snapshot") }), { code: "DATABASE_SNAPSHOT_FAILED", message: /nothing was backed up/ });
  await assert.rejects(prepareShareContent(h.ports, { signal: AbortSignal.abort() }), { name: "AbortError" });
});
test("preparation without settings regenerates portable defaults and preserves watermark", async t => {
  const h = await preparation(t), result = await prepareShareContent(h.ports);
  assert.deepEqual(result.site, { name: "source", folderName: "source" });
  assert.equal(result.database!.watermarkAtCapture, 7);
  assert.deepEqual(result.bufferedFiles?.map(f => [f.path, JSON.parse(f.content.toString())]), [["settings.json", { name: "source", template: {} }]]);
  assert.equal(result.totalBytes, 9 + result.bufferedFiles!.reduce((n, f) => n + f.content.length, 0));
  assert.equal(fs.existsSync(path.join(h.root, "snapshot.db")), false);
});
test("portable settings retain only safe provenance values and never host credentials or identity", async t => {
  const h = await preparation(t);
  fs.writeFileSync(path.join(h.siteDir, "config.json"), JSON.stringify({ name: 42, domain: "private.test", port: 9000, password: "private" }));
  fs.writeFileSync(path.join(h.siteDir, ".site-meta.json"), JSON.stringify({ siteId: "private", templateId: "starter", templateVersion: "1.0+beta", schemaVersion: 0, schemaTag: "unsafe space" }));
  const result = await prepareShareContent(h.ports);
  assert.deepEqual(JSON.parse(result.bufferedFiles!.find(f => f.path === "settings.json")!.content.toString()), { name: "source", template: { templateId: "starter", templateVersion: "1.0+beta", schemaVersion: 0 } });
  assert.deepEqual(JSON.parse(result.bufferedFiles!.find(f => f.path === "settings.json")!.content.toString()).template, { templateId: "starter", templateVersion: "1.0+beta", schemaVersion: 0 });
  fs.writeFileSync(path.join(h.siteDir, ".site-meta.json"), JSON.stringify({ templateId: -1, templateVersion: 0.5, schemaVersion: null, schemaTag: {} }));
  const invalidProvenance = await prepareShareContent(h.ports);
  assert.equal(JSON.stringify(JSON.parse(invalidProvenance.bufferedFiles!.find(f => f.path === "settings.json")!.content.toString()).template), "{}");
});
for (const text of ["{", "null", "[]", "42", '"name"']) test(`settings refuse non-object JSON ${text}`, async t => {
  const h = await preparation(t); fs.writeFileSync(path.join(h.siteDir, "config.json"), text);
  await assert.rejects(prepareShareContent(h.ports), { code: "INVALID_SETTINGS", message: /JSON object/ });
});
test("oversized settings refuse before JSON parsing", async t => {
  const h = await preparation(t), file = path.join(h.siteDir, "config.json");
  fs.writeFileSync(file, " ".repeat(SHARE_LIMITS.maxManifestBytes + 1));
  await assert.rejects(prepareShareContent(h.ports), { code: "INVALID_SETTINGS", message: /exceeds 2 MiB/ });
});
test("linked required content causes a named refusal instead of silently omitting the file", async t => {
  const h = await preparation(t); fs.mkdirSync(h.ports.sources.themesDir); fs.symlinkSync(path.join(h.siteDir, "outside"), path.join(h.ports.sources.themesDir, "linked.html"));
  await assert.rejects(prepareShareContent(h.ports), { code: "UNSAFE_FILE", message: /themes\/linked.html.*symbolic link/ });
});
for (const [label, size, content, sha256, code] of [
  ["missing", null, "", undefined, "MISSING_MEDIA"], ["negative size", -1, "", undefined, "UNBOUNDED_MEDIA"],
  ["fractional size", 0.5, "", undefined, "UNBOUNDED_MEDIA"], ["non-finite size", Infinity, "", undefined, "UNBOUNDED_MEDIA"],
  ["changed length", 2, "x", undefined, "MEDIA_CHANGED"], ["changed hash", 1, "x", "0".repeat(64), "MEDIA_CHANGED"],
] as const) test(`media ${label} refuses before archive creation`, async t => {
  const h = await preparation(t); let reads = 0;
  await assert.rejects(prepareShareContent({ ...h.ports, sanitize: async () => h.enrich({ ...h.projection, media: [{ storageKey: "blob", sha256 }] }), blobStore: { sizeOf: async () => size, get: async () => { reads++; return Buffer.from(content); } } }), { code });
  assert.equal(reads, code === "MEDIA_CHANGED" ? 1 : 0);
});
test("media must have a size-aware store", async t => {
  const h = await preparation(t);
  await assert.rejects(prepareShareContent({ ...h.ports, sanitize: async () => h.enrich({ ...h.projection, media: [{ storageKey: "blob" }] }), blobStore: { get: async () => assert.fail("unbounded media must not be fetched") } }), { code: "UNBOUNDED_MEDIA" });
});
for (const size of [0, 10 * 1024 * 1024 + 1]) test(`Library document size ${size} refuses before reading bytes`, async t => {
  const h = await preparation(t);
  await assert.rejects(prepareShareContent({ ...h.ports, sanitize: async () => h.enrich({ ...h.projection, media: [{ storageKey: "doc" }], documents: [{ storageKey: "doc", sha256: "0".repeat(64), originalFilename: "x.pdf" }] }), blobStore: { sizeOf: async () => size, get: async () => assert.fail("invalid document must not be fetched") } }), { code: "INVALID_DOCUMENT" });
});
test("duplicate media references fetch once and preserve the source bytes", async t => {
  const h = await preparation(t), calls: unknown[] = [];
  const result = await prepareShareContent({ ...h.ports, sanitize: async () => h.enrich({ ...h.projection, media: [{ storageKey: "blob" }, { storageKey: "blob" }] }), blobStore: { sizeOf: async input => { calls.push(input); return 3; }, get: async input => { calls.push(input); return Buffer.from("abc"); } } });
  assert.deepEqual(calls, [{ storageKey: "blob" }, { storageKey: "blob" }]);
  assert.deepEqual(result.bufferedFiles!.filter(f => f.path.startsWith("media/")), [{ path: "media/blob.bin", content: Buffer.from("abc") }]);
});

test("settings removed after collection refuse as stale instead of returning a partial share", async t => {
  const h = await preparation(t), file = path.join(h.siteDir, "config.json"); fs.writeFileSync(file, "{}");
  await assert.rejects(prepareShareContent({ ...h.ports, sanitize: async () => h.enrich({ ...h.projection, media: [{ storageKey: "blob" }] }), blobStore: { sizeOf: async () => 1, get: async () => { fs.rmSync(file); return Buffer.from("x"); } } }), { code: "PLAN_STALE" });
});
test("media cap is enforced from reported size before fetching the blob", async t => {
  const h = await preparation(t);
  await assert.rejects(prepareShareContent({ ...h.ports, sanitize: async () => h.enrich({ ...h.projection, media: [{ storageKey: "blob" }] }), blobStore: { sizeOf: async () => SHARE_LIMITS.maxFileBytes + 1, get: async () => assert.fail("oversized blobs must not be buffered") } }), { code: "LIMIT_EXCEEDED" });
});
