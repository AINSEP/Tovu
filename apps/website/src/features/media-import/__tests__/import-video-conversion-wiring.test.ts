import type { MediaImportToolDeps } from "@jini-ai/cms/media/site-import/bindings";
import { resolveMediaPublicUrls } from "#src/features/media/public-urls";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createTempSiteLayoutFixture, testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media/index.js";
import { InMemoryMediaContentTypeStore } from "@jini-ai/cms/media/site/content-type-store";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import type { HttpResponse } from "#src/platform/http/index";
import { buildMediaImportRegistrations } from "../tool-registrations.js";
import type { VideoImportOptions } from "../../media/import-video-conversion.js";

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
  const response: Partial<HttpResponse> = { status: 200, headers: { "content-type": "video/mp4" }, bodyText: "", bodyBytes: MP4 };
  const deps: MediaImportToolDeps = testSiteLayoutContext({ ...siteLayouts.deps,
    siteBinding: { ...siteLayouts.deps.siteBinding, dir: rootPath },
    workspaceId: WORKSPACE, clock: createFakeClock({ startIso: "2026-10-01T00:00:00.000Z" }), idGen: { newId: () => `conv-${++ids}` },
    mediaRepo: new InMemoryMediaRepo({}), assetBlobRepo: new InMemoryAssetBlobRepo({}), assetRenditionRepo: new InMemoryAssetRenditionRepo({}),
    blobStore: new InMemoryBlobStore(), mediaContentTypeStore: new InMemoryMediaContentTypeStore(), transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}),
    mediaImportHttpClient: { send: async () => response as HttpResponse },
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
  return { deps, rootPath, run, converted, notes };
}

async function assertOriginalKeptWithCopy(f: ReturnType<typeof setup>, originalId: string) {
  assert.equal(f.converted.length, 1, "the converter ran");
  assert.deepEqual(Buffer.from(f.converted[0]!), MP4);
  const all = await f.deps.mediaRepo.list({ workspaceId: WORKSPACE });
  assert.ok(all.some((item) => item.id === originalId), "the original is kept and is what the tool returns");
  assert.equal(all.filter((item) => item.id !== originalId).length, 1, "one converted copy next to the original");
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
  const f = setup(t, { fail: new Error("spawn /opt/secret/ffmpeg ENOENT") });
  const result = await f.run("media_import_from_url", { url: "https://cdn.example/Holiday.mp4" });
  assert.equal((await f.deps.mediaRepo.list({ workspaceId: WORKSPACE })).length, 1, "the original stays");
  assert.equal(f.notes.length, 1);
  assert.match(String((f.notes[0]!.cause as Error).message), /secret\/ffmpeg/, "the raw cause reaches the operator log");
  assert.doesNotMatch(f.notes[0]!.note, /secret|ENOENT|spawn/, "the owner-facing sentence is plain words");
  assert.doesNotMatch(JSON.stringify(result), /secret|ENOENT|spawn/);
});

test("the production note sink logs the plain sentence and hands the raw cause over separately", async () => {
  const { operatorLogVideoNote } = await import("../../media/import-video-conversion.js");
  const lines: Array<{ line: string; cause: unknown }> = [];
  const cause = new Error("spawn /opt/secret/ffmpeg ENOENT");
  operatorLogVideoNote({ warn: (line, raw) => lines.push({ line, cause: raw }) })({ note: "The video was saved as uploaded, but a web-playable copy could not be made.", cause });
  assert.deepEqual(lines, [{ line: "[media-import] The video was saved as uploaded, but a web-playable copy could not be made.", cause }]);
});
