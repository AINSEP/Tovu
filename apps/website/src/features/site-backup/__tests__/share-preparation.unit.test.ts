/**
 * Pins every refusal text and the plan shape of `prepareShareContent` with a temp site folder and
 * typed port fakes (snapshot, sanitizer, blob store). Each test removes its folder.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { MAX_DOCUMENT_BYTES } from "#src/features/media/index";
import { prepareShareContent } from "../share-preparation.js";
import { SHARE_LIMITS, type ShareDatabaseProjection } from "../share-policy.js";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";

type Ports = Parameters<typeof prepareShareContent>[0];
type BlobStore = Ports["blobStore"];
const BLOB = Buffer.from("blob bytes");
const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

function harness(t: TestContext, projection: ShareDatabaseProjection = { bytes: Buffer.from("projected"), media: [] }, blobStore?: BlobStore): { siteDir: string; ports: Ports; snapshot: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-share-prep-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const siteDir = path.join(root, "my-site"), snapshot = path.join(root, "snapshot.db");
  fs.mkdirSync(siteDir);
  const ports: Ports = {
    snapshotRoot: root,
    sources: { siteDir, themesDir: path.join(siteDir, "themes"), skillsDir: path.join(siteDir, "skills"), mediaUploadsDir: null, agentPlugins: resolveAgentPluginLayout({ siteDir: siteDir }, { env: {} }), tovuVersion: "9.9.9" },
    sanitize: async () => projection, rewriteMedia: async ({ bytes }) => bytes, imageTransformer: { transform: async () => assert.fail("not raster") },
    blobStore: blobStore ?? { sizeOf: async () => BLOB.length, get: async () => BLOB },
    dbOps: {
      getCapabilities: async () => ({ restorePoint: { kind: "file-snapshot", costClass: "cheap" } }),
      captureRestorePoint: async () => { fs.writeFileSync(snapshot, "private snapshot"); return { artifactRef: snapshot, watermarkAtCapture: 7 }; },
      restoreFromArtifact: async () => assert.fail("a share never restores"),
    },
  };
  return { siteDir, ports, snapshot };
}
const withMedia = (media: ShareDatabaseProjection["media"], documents?: ShareDatabaseProjection["documents"]): ShareDatabaseProjection => ({ bytes: Buffer.from("projected"), media, documents, archiveMedia: [...new Map(media.map(row => [row.storageKey, row])).values()].map(row => ({ ...row, sha256: row.sha256 ?? "", id: row.storageKey, slug: row.storageKey, workspaceId: "ws", kind: documents?.some(doc => doc.storageKey === row.storageKey) ? "document" : "media", originalFilename: documents?.find(doc => doc.storageKey === row.storageKey)?.originalFilename ?? null })) });
const writeSetting = (siteDir: string, name: string, text: string) => fs.writeFileSync(path.join(siteDir, name), text);

// Database ------------------------------------------------------------------------------------

test("an already-aborted signal stops before the snapshot is taken", async t => {
  const h = harness(t), reason = new Error("stopped");
  await assert.rejects(prepareShareContent(h.ports, { signal: AbortSignal.abort(reason) }), reason);
  assert.equal(fs.existsSync(h.snapshot), false);
});
test("a snapshot failure is refused with the snapshot's own message", async t => {
  const h = harness(t);
  const dbOps: Ports["dbOps"] = { ...h.ports.dbOps, getCapabilities: async () => ({ restorePoint: { kind: "logical-dump", costClass: "expensive" } }) };
  await assert.rejects(prepareShareContent({ ...h.ports, dbOps }), { code: "DATABASE_SNAPSHOT_FAILED", message: "this site's database cannot be snapshotted into a backup file: only SQLite sites are supported (this database reports a 'logical-dump' restore mechanism)" });
});
test("the sanitizer receives the snapshot bytes and the caller's signal", async t => {
  const h = harness(t), signal = new AbortController().signal, seen: unknown[] = [];
  await prepareShareContent({ ...h.ports, sanitize: async (required, optional) => { seen.push([required.snapshot.toString(), optional?.signal]); return { bytes: Buffer.from("p"), media: [] }; } }, { signal });
  assert.deepEqual(seen, [["private snapshot", signal]]);
});
test("a projected database over the expanded cap is refused before media is read", async t => {
  const h = harness(t, { bytes: Buffer.allocUnsafeSlow(SHARE_LIMITS.maxExpandedBytes + 1), media: [] });
  await assert.rejects(prepareShareContent(h.ports), { code: "LIMIT_EXCEEDED", message: "Share exceeds the 300 MiB expanded cap. Reduce the site or wait for streaming exports." });
});

// Collected files ------------------------------------------------------------------------------

test("a skipped site file is refused by name with its reason", async t => {
  const h = harness(t);
  fs.mkdirSync(path.join(h.siteDir, "themes"));
  fs.symlinkSync("/etc/hosts", path.join(h.siteDir, "themes/linked.html"));
  await assert.rejects(prepareShareContent(h.ports), { code: "UNSAFE_FILE", message: "Cannot share 'themes/linked.html': a symbolic link — never followed, so nothing outside the site can ride along. Remove it or replace it with a regular file." });
});
test("the plan lists collected non-settings files and buffers regenerated settings", async t => {
  const h = harness(t);
  fs.mkdirSync(path.join(h.siteDir, "themes/static/site"), { recursive: true });
  fs.writeFileSync(path.join(h.siteDir, "themes/static/site/index.html"), "<main/>");
  writeSetting(h.siteDir, "config.json", JSON.stringify({ name: "Shared Name", domain: "private.test", port: 1 }));
  const plan = await prepareShareContent(h.ports);
  assert.deepEqual(plan.files.map(file => [file.path, file.scope]), [["themes/static/site/index.html", "themes"]]);
  assert.deepEqual(plan.bufferedFiles?.map(file => [file.path, file.content.toString()]), [["settings.json", '{"name":"Shared Name","template":{}}']]);
  assert.deepEqual(plan.site, { name: "Shared Name", folderName: "my-site" });
  assert.deepEqual([plan.target, plan.profile, plan.include, plan.skipped, plan.scopeNotes, plan.tovuVersion, plan.database?.watermarkAtCapture], [{ kind: "zip" }, "share", { database: true, media: true, themes: true, plugins: true, settings: true }, [], {}, "9.9.9", 7]);
  assert.equal(plan.totalBytes, "<main/>".length + "projected".length + plan.bufferedFiles!.reduce((sum, file) => sum + file.content.length, 0));
  assert.equal(fs.existsSync(h.snapshot), false);
});

// Media ---------------------------------------------------------------------------------------

test("an abort before a media fetch stops the media loop", async t => {
  const controller = new AbortController(), reason = new Error("stopped in media");
  const h = harness(t, withMedia([{ storageKey: "blob" }]));
  const sanitize: Ports["sanitize"] = async () => { controller.abort(reason); return withMedia([{ storageKey: "blob" }]); };
  await assert.rejects(prepareShareContent({ ...h.ports, sanitize }, { signal: controller.signal }), reason);
});
test("repeated media keys are fetched and buffered once", async t => {
  let fetches = 0;
  const h = harness(t, withMedia([{ storageKey: "blob" }, { storageKey: "blob" }]), { sizeOf: async () => BLOB.length, get: async () => { fetches++; return BLOB; } });
  const plan = await prepareShareContent(h.ports);
  assert.equal(fetches, 1);
  assert.deepEqual(plan.bufferedFiles?.filter(file => file.path.startsWith("media/")).map(file => [file.path, file.content]), [["media/blob.bin", BLOB]]);
});
test("a media key that is not a safe path is refused", async t => {
  const h = harness(t, withMedia([{ storageKey: "CON.txt" }]));
  await assert.rejects(prepareShareContent(h.ports), { code: "UNSAFE_PATH", message: "Share path 'uploads/CON.txt' is unsafe." });
});
test("a blob store that cannot report sizes is refused", async t => {
  const h = harness(t, withMedia([{ storageKey: "blob" }]), { get: async () => assert.fail("unbounded media must not be fetched") });
  await assert.rejects(prepareShareContent(h.ports), { code: "UNBOUNDED_MEDIA", message: "This media store cannot report blob sizes. Configure a size-aware blob store before sharing." });
});
test("media missing from the blob store is refused by key", async t => {
  const h = harness(t, withMedia([{ storageKey: "blob" }]), { sizeOf: async () => null, get: async () => assert.fail("missing media must not be fetched") });
  await assert.rejects(prepareShareContent(h.ports), { code: "MISSING_MEDIA", message: "Share media 'blob' is missing from the blob store." });
});
for (const size of [-1, 1.5]) {
  test(`a reported media size of ${size} is refused`, async t => {
    const h = harness(t, withMedia([{ storageKey: "blob" }]), { sizeOf: async () => size, get: async () => assert.fail("must not fetch") });
    await assert.rejects(prepareShareContent(h.ports), { code: "UNBOUNDED_MEDIA", message: "Media storage returned an invalid byte count; nothing was shared." });
  });
}
for (const size of [0, MAX_DOCUMENT_BYTES + 1]) {
  test(`a Library document blob of ${size} bytes is refused`, async t => {
    const h = harness(t, withMedia([{ storageKey: "doc" }], [{ storageKey: "doc", sha256: "0".repeat(64), originalFilename: "a.pdf" }]), { sizeOf: async () => size, get: async () => assert.fail("must not fetch") });
    await assert.rejects(prepareShareContent(h.ports), { code: "INVALID_DOCUMENT", message: "Library document blobs must be non-empty and at most 10 MiB; nothing was shared." });
  });
}
test("an empty blob that is not a document is shared", async t => {
  const h = harness(t, withMedia([{ storageKey: "empty" }]), { sizeOf: async () => 0, get: async () => Buffer.alloc(0) });
  assert.equal((await prepareShareContent(h.ports)).bufferedFiles?.find(file => file.path === "media/empty.bin")?.content.length, 0);
});
test("a blob over the ordinary-file cap is refused from its reported size", async t => {
  const h = harness(t, withMedia([{ storageKey: "big" }]), { sizeOf: async () => SHARE_LIMITS.maxFileBytes + 1, get: async () => assert.fail("must not fetch") });
  await assert.rejects(prepareShareContent(h.ports), { code: "LIMIT_EXCEEDED", message: "Share file 'media/blob' exceeds the 64 MiB ordinary-file cap." });
});
test("a blob whose bytes differ in length from its reported size is refused", async t => {
  const h = harness(t, withMedia([{ storageKey: "blob" }]), { sizeOf: async () => BLOB.length + 1, get: async () => BLOB });
  await assert.rejects(prepareShareContent(h.ports), { code: "MEDIA_CHANGED", message: "Share media 'blob' changed or failed its checksum." });
});
test("a blob whose hash differs from the database is refused", async t => {
  const h = harness(t, withMedia([{ storageKey: "blob", sha256: "0".repeat(64) }]));
  await assert.rejects(prepareShareContent(h.ports), { code: "MEDIA_CHANGED", message: "Share media 'blob' changed or failed its checksum." });
});
test("a blob whose hash matches the database is shared", async t => {
  const h = harness(t, withMedia([{ storageKey: "blob", sha256: sha(BLOB) }]));
  assert.deepEqual((await prepareShareContent(h.ports)).bufferedFiles?.[0], { path: "media/blob.bin", content: BLOB });
});

// Portable settings ------------------------------------------------------------------------------

test("a config without a string name falls back to the site folder name", async t => {
  const h = harness(t);
  writeSetting(h.siteDir, "config.json", JSON.stringify({ name: 42 }));
  assert.equal((await prepareShareContent(h.ports)).site.name, "my-site");
});
test("site meta keeps only well-formed provenance values", async t => {
  const h = harness(t);
  writeSetting(h.siteDir, ".site-meta.json", JSON.stringify({ siteId: "private", templateId: "starter", templateVersion: "1.0+beta", schemaVersion: 0, schemaTag: "unsafe space" }));
  const plan = await prepareShareContent(h.ports);
  assert.equal(JSON.stringify(JSON.parse(plan.bufferedFiles!.find(file => file.path === "settings.json")!.content.toString()).template), '{"templateId":"starter","templateVersion":"1.0+beta","schemaVersion":0}');
});
test("site meta drops negative, fractional and non-scalar provenance values", async t => {
  const h = harness(t);
  writeSetting(h.siteDir, ".site-meta.json", JSON.stringify({ templateId: -1, templateVersion: 0.5, schemaVersion: null, schemaTag: {} }));
  assert.equal(JSON.stringify(JSON.parse((await prepareShareContent(h.ports)).bufferedFiles!.find(file => file.path === "settings.json")!.content.toString()).template), "{}");
});
test("a settings file over 2 MiB is refused before it is read", async t => {
  const h = harness(t);
  writeSetting(h.siteDir, "config.json", " ".repeat(SHARE_LIMITS.maxManifestBytes + 1));
  await assert.rejects(prepareShareContent(h.ports), { code: "INVALID_SETTINGS", message: "Share settings 'settings/config.json' exceeds 2 MiB." });
});
for (const text of ["{", "null", "[]", "42"]) {
  test(`a settings file containing ${text} is refused as not a JSON object`, async t => {
    const h = harness(t);
    writeSetting(h.siteDir, ".site-meta.json", text);
    await assert.rejects(prepareShareContent(h.ports), { code: "INVALID_SETTINGS", message: "Share settings 'settings/.site-meta.json' must contain a JSON object." });
  });
}
test("a settings file changed after collection is refused as a stale plan", async t => {
  const h = harness(t, withMedia([{ storageKey: "blob" }]), { sizeOf: async () => BLOB.length, get: async () => { fs.writeFileSync(path.join(h.siteDir, "config.json"), '{"name":"changed!"}'); return BLOB; } });
  writeSetting(h.siteDir, "config.json", "{}");
  await assert.rejects(prepareShareContent(h.ports), { code: "PLAN_STALE", message: "'settings/config.json' changed since the plan was made. Call site_backup_plan again." });
});
test("regenerated settings that tip the share over the expanded cap are refused", async t => {
  const h = harness(t, { bytes: Buffer.allocUnsafeSlow(SHARE_LIMITS.maxExpandedBytes - 10), media: [] });
  await assert.rejects(prepareShareContent(h.ports), { code: "LIMIT_EXCEEDED", message: "Share exceeds the 300 MiB expanded cap. Reduce the site or wait for streaming exports." });
});
