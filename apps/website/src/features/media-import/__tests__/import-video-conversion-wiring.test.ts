import type { MediaImportToolDeps } from "@jini-ai/cms/media/site-import/bindings";
import { resolveMediaPublicUrls } from "#src/features/media/public-urls";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createTempSiteLayoutFixture, testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media/index.js";
import { InMemoryMediaContentTypeStore } from "@jini-ai/cms/media/site/content-type-store";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import type { HttpClientPort, HttpResponse } from "#src/platform/http/index";
import { buildMediaImportRegistrations, contributeMediaImportTools } from "../tool-registrations.js";
import type { VideoImportOptions } from "../../media/import-video-conversion.js";
import { createMediaBlobStore } from "../../object-storage/media-store.js";
import { MAX_UPLOAD_BYTES } from "@tovu/contracts/upload-limits";

/**
 * @file The assistant's two import tools (URL and local file) apply the owner's video import rule
 * (2026-10-31) the same way the admin routes do: a stored video over the threshold gets a web-safe copy
 * and keeps its original. Threshold injected small (the real 50 MiB sits at the upload cap); converter fake.
 */
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from("ftypisom"), Buffer.from([0, 0, 0, 0]), Buffer.from("isomiso2avc1mp41")]);
const CONVERTED = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypmp42"), 0, 0, 0, 0, ...Buffer.from("mp42isom")]);
const WORKSPACE = "ws-conv";

function setup(t: test.TestContext, optional: { fail?: Error } = {}) {
  const siteLayouts = createTempSiteLayoutFixture({});
  const rootPath = path.join(siteLayouts.siteDir, "root");
  fs.mkdirSync(rootPath);
  t.after(() => siteLayouts.cleanup());
  let ids = 0;
  const response: HttpResponse = { status: 200, headers: { "content-type": "video/mp4" }, bodyText: "", bodyBytes: MP4, bodyTruncated: false };
  const mediaImportHttpClient: HttpClientPort = { send: async ({ method, url }) => {
    assert.equal(method, "GET");
    assert.equal(url, "https://cdn.example/Holiday.mp4");
    return response;
  } };
  const deps: MediaImportToolDeps = testSiteLayoutContext({ ...siteLayouts.deps,
    createHash,
    siteBinding: { ...siteLayouts.deps.siteBinding, dir: rootPath },
    workspaceId: WORKSPACE, clock: createFakeClock({ startIso: "2026-10-01T00:00:00.000Z" }), idGen: { newId: () => `conv-${++ids}` },
    mediaRepo: new InMemoryMediaRepo({}), assetBlobRepo: new InMemoryAssetBlobRepo({}), assetRenditionRepo: new InMemoryAssetRenditionRepo({}),
    blobStore: new InMemoryBlobStore(), mediaContentTypeStore: new InMemoryMediaContentTypeStore(), transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}),
    mediaImportHttpClient,
    authorize: async () => ({ allowed: true, reason: "test" }),
    resolveRoots: () => ({ repo: rootPath, site: rootPath, custom: rootPath }),
  });
  const converted: Uint8Array[] = [];
  const notes: Array<{ note: string; cause: unknown }> = [];
  const videoImport: VideoImportOptions = {
    ports: { transcoder: { transcode: async ({ input }) => {
      if (optional.fail) throw optional.fail;
      converted.push(input);
      return { ok: true, bytes: CONVERTED };
    } } },
    reportNote: (note) => { notes.push(note); },
    thresholdBytes: 10,
  };
  async function run(toolId: string, input: Record<string, unknown>) {
    const found = buildMediaImportRegistrations({ deps, videoImport, resolvePublicUrls: resolveMediaPublicUrls }, {}).find((r) => r.descriptor.id === toolId);
    assert.ok(found, `${toolId} must be wired`);
    const ctx: ToolExecutionContext = { input, executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, signal: new AbortController().signal };
    return await found.handler(ctx) as { media: { id: string } };
  }
  return { deps, rootPath, run, converted, notes, videoImport };
}

async function assertOriginalKeptWithCopy(f: ReturnType<typeof setup>, originalId: string) {
  assert.equal(f.converted.length, 1, "the converter ran");
  assert.deepEqual(f.converted.map(bytes => Buffer.from(bytes)), [MP4]);
  const all = await f.deps.mediaRepo.list({ workspaceId: WORKSPACE });
  const originalHash = createHash("sha256").update(MP4).digest("hex");
  const convertedHash = createHash("sha256").update(CONVERTED).digest("hex");
  assert.equal(all.find(item => item.id === originalId)?.source.sha256, originalHash);
  assert.deepEqual(all.filter(item => item.id !== originalId).map(item => item.source.sha256), [convertedHash]);
  const blob = await f.deps.assetBlobRepo.findByHash({ workspaceId: WORKSPACE, sha256: convertedHash });
  assert.ok(blob);
  assert.deepEqual(Buffer.from(await f.deps.blobStore.get({ storageKey: blob.storageKey })), Buffer.from(CONVERTED));
}

test("assistant URL import: a video over the import threshold is converted and the original is kept", async (t) => {
  const f = setup(t);
  const { media } = await f.run("media_import_from_url", { url: "https://cdn.example/Holiday.mp4" });
  await assertOriginalKeptWithCopy(f, media.id);
});

test("assistant local import: a video over the import threshold is converted and the original is kept", async (t) => {
  const f = setup(t);
  fs.writeFileSync(path.join(f.rootPath, "Holiday.mp4"), MP4);
  const { media } = await f.run("media_import_local_file", { root: "custom", path: "Holiday.mp4" });
  await assertOriginalKeptWithCopy(f, media.id);
});

test("assistant import: a failed conversion keeps the original, hands the raw cause only to the operator note, and the tool result carries no raw error text", async (t) => {
  const failure = new Error("spawn /opt/secret/ffmpeg ENOENT");
  const f = setup(t, { fail: failure });
  const result = await f.run("media_import_from_url", { url: "https://cdn.example/Holiday.mp4" });
  const all = await f.deps.mediaRepo.list({ workspaceId: WORKSPACE });
  assert.deepEqual(all.map(item => [item.id, item.source.sha256]), [[result.media.id, createHash("sha256").update(MP4).digest("hex")]]);
  assert.equal(f.notes.length, 1);
  const [note] = f.notes;
  assert.ok(note);
  assert.equal(note.cause, failure, "the raw cause reaches the operator log");
  assert.equal(note.note, "The video was saved as uploaded, but a web-playable copy could not be made.");
  assert.doesNotMatch(JSON.stringify(result), /secret|ENOENT|spawn/);
});

test("the production note sink logs the plain sentence and hands the raw cause over separately", async () => {
  const { operatorLogVideoNote } = await import("@jini-ai/cms/media/site/import-video-conversion");
  const lines: Array<{ line: string; cause: unknown }> = [];
  const cause = new Error("spawn /opt/secret/ffmpeg ENOENT");
  operatorLogVideoNote({ warn: (line, raw) => lines.push({ line, cause: raw }) })({ note: "The video was saved as uploaded, but a web-playable copy could not be made.", cause });
  assert.deepEqual(lines, [{ line: "[media-import] The video was saved as uploaded, but a web-playable copy could not be made.", cause }]);
});

async function setupStaged({ t, mode }: { t: test.TestContext; mode: "success" | "failure" | "cancel" }, _optional = {}) {
  const f = setup(t);
  const uploadsDir = path.join(f.rootPath, "uploads");
  const { blobStore } = createMediaBlobStore({ uploadsDir, env: { TOVU_MEDIA_BLOB_STORE: "local" }, ports: () => { throw new Error("local selection must not load a registry"); } });
  f.deps.blobStore = blobStore;
  const get = t.mock.method(blobStore, "get", async () => { throw new Error("conversion reloaded the original buffer"); });
  const sourcePath = path.join(f.rootPath, "Holiday.mov");
  fs.writeFileSync(sourcePath, MP4);
  fs.truncateSync(sourcePath, MAX_UPLOAD_BYTES + 1);
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(sourcePath, { highWaterMark: 64 * 1024 })) hash.update(chunk);
  const sha256 = hash.digest("hex");
  const controller = new AbortController();
  const spools: string[] = [];
  const cause = new Error("spawn /opt/secret/ffmpeg ENOENT");
  f.videoImport.ports.stagedTranscoder = { async transcodeStaged({ input, consume }, { signal } = {}) {
    spools.push(input.root);
    assert.equal(signal, controller.signal);
    assert.equal(input.sha256, sha256);
    assert.equal(input.byteLength, MAX_UPLOAD_BYTES + 1);
    assert.ok(fs.existsSync(input.path));
    const blob = await f.deps.assetBlobRepo.findByHash({ workspaceId: WORKSPACE, sha256 });
    assert.ok(blob);
    assert.ok(await blobStore.exists({ storageKey: blob.storageKey }));
    const originals = (await f.deps.mediaRepo.list({ workspaceId: WORKSPACE })).filter(item => item.source.sha256 === sha256);
    assert.ok(originals.length > 0);
    const renditions = await f.deps.assetRenditionRepo.listByAsset({ workspaceId: WORKSPACE, assetId: originals.at(-1)!.id });
    assert.equal(renditions.length, 1);
    assert.equal(renditions[0]!.storageKey, blob.storageKey);
    if (mode === "failure") throw cause;
    if (mode === "cancel") controller.abort(cause);
    const outputPath = path.join(input.root, "output.mp4");
    fs.writeFileSync(outputPath, CONVERTED, { mode: 0o600 });
    return { ok: true, value: await consume({ ...input, path: outputPath, byteLength: CONVERTED.byteLength,
      sha256: createHash("sha256").update(CONVERTED).digest("hex"), contentType: "video/mp4",
      openChunks: async function* () { yield CONVERTED; },
    }) };
  } };
  const contributor = contributeMediaImportTools({ resolvePublicUrls: resolveMediaPublicUrls, videoImport: f.videoImport }, {});
  const registration = contributor.build(f.deps, {}).find(item => item.descriptor.id === "media_import_local_file");
  assert.ok(registration);
  const run = () => registration.handler({ input: { root: "custom", path: "Holiday.mov" }, executionId: "staged", principal: { id: "owner" }, run: { id: "run" }, signal: controller.signal }) as Promise<{ media: { id: string; sha256: string } }>;
  return { ...f, run, sha256, spools, get, uploadsDir, cause, controller };
}

test("The composed local import stores the original before staged conversion.", async (t) => {
  for (const mode of ["success", "failure", "cancel"] as const) {
    await t.test(mode, async (t) => {
      const f = await setupStaged({ t, mode });
      const result = await f.run();
      assert.equal(result.media.sha256, f.sha256);
      const blob = await f.deps.assetBlobRepo.findByHash({ workspaceId: WORKSPACE, sha256: f.sha256 });
      assert.ok(blob);
      const storedHash = createHash("sha256");
      for await (const chunk of fs.createReadStream(path.join(f.uploadsDir, blob.storageKey), { highWaterMark: 64 * 1024 })) storedHash.update(chunk);
      assert.equal(storedHash.digest("hex"), f.sha256);
      const all = await f.deps.mediaRepo.list({ workspaceId: WORKSPACE });
      assert.equal(all.length, mode === "success" ? 2 : 1);
      assert.equal(all.find(item => item.id === result.media.id)?.createdBy, "owner");
      assert.deepEqual(all.find(item => item.id === result.media.id)?.source.provenance, { kind: "upload", path: "Holiday.mov" });
      if (mode === "success") {
        assert.equal(all.find(item => item.id !== result.media.id)?.description, 'Web-playable copy of "Holiday".');
        const duplicate = await f.run();
        assert.notEqual(duplicate.media.id, result.media.id);
        assert.equal((await f.deps.mediaRepo.list({ workspaceId: WORKSPACE })).filter(item => item.source.sha256 === f.sha256).length, 2);
        assert.equal((await f.deps.assetBlobRepo.list({ workspaceId: WORKSPACE })).filter(item => item.sha256 === f.sha256).length, 1);
        assert.equal(fs.readdirSync(path.dirname(path.join(f.uploadsDir, blob.storageKey))).filter(name => name === f.sha256).length, 1);
      } else {
        assert.equal(f.notes.length, 1);
        if (mode === "failure") assert.equal(f.notes[0]!.cause, f.cause);
        if (mode === "cancel") assert.equal(f.controller.signal.aborted, true);
        assert.doesNotMatch(f.notes[0]!.note, /secret|ENOENT|spawn/);
        assert.doesNotMatch(JSON.stringify(result), /secret|ENOENT|spawn/);
      }
      assert.equal(f.spools.length, mode === "success" ? 2 : 1);
      for (const root of f.spools) assert.equal(fs.existsSync(root), false);
      assert.equal(f.get.mock.calls.length, 0);
      assert.deepEqual(f.converted, []);
    });
  }
});
