/** Quick wins A contract: guarded admin URL import uses the real upload repositories. */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import express from "express";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { EgressRefusedError, type HttpClientPort, type HttpResponse } from "#src/platform/http/index";
import { registerAdminMediaImportUrlRoute, type VideoImportOptions } from "#src/server/runtime/composition/modules/media";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function harness(t: TestContext, options: { allowed?: boolean; response?: Partial<HttpResponse>; refusal?: boolean; videoImport?: VideoImportOptions } = {}) {
  const base = createRouteDeps();
  const calls: unknown[] = [];
  const logs: string[] = [];
  const mediaImportHttpClient: HttpClientPort = { async send(request) {
    calls.push(request);
    if (options.refusal) throw new EgressRefusedError({ message: "internal.example resolves to 10.1.2.3" }, { callerSafeMessage: "Target is not public" });
    return { status: 200, headers: { "content-type": "text/html" }, bodyText: "lossy", bodyBytes: PNG, ...options.response };
  } };
  const deps = { ...base, mediaImportHttpClient, authorize: async () => ({ allowed: options.allowed !== false, reason: "test" }) };
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "import-owner" }; next(); });
  registerAdminMediaImportUrlRoute({ app, deps }, { logEgressRefusal: (line) => logs.push(line), ...(options.videoImport ? { videoImport: options.videoImport } : {}) });
  const origin = await startTestServer(app, t);
  const post = async (body: unknown, workspace = base.workspaceId) => {
    const response = await fetch(`${origin}/api/admin/v1/workspaces/${workspace}/media/import-url`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
  };
  return { deps, calls, logs, post };
}

test("admin URL import stores exact downloaded bytes and returns a complete admin media DTO", async (t) => {
  const { deps, post, calls } = await harness(t);
  const { status, json } = await post({ url: "https://cdn.example/photo", filename: "photo.png", alt: "A fox", caption: "Photo", credit: "Photographer" });
  assert.equal(status, 201);
  assert.equal(calls.length, 1);
  assert.equal(json.media.contentType, "image/png", "header must not override sniffed bytes");
  assert.equal(json.media.alt, "A fox");
  assert.equal(json.media.credit, "Photographer");
  assert.equal(json.media.workspaceId, deps.workspaceId);
  assert.equal(json.media.width, null);
  assert.equal(typeof json.media.createdAt, "string");
  const blob = await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256: json.media.sha256 });
  assert.ok(blob);
  assert.deepEqual(Buffer.from((await deps.blobStore.get({ storageKey: blob.storageKey }))!), PNG);
});

test("workspace mismatch and denied media.upload perform no outbound request", async (t) => {
  const { deps, post, calls } = await harness(t, { allowed: false });
  assert.equal((await post({ url: "https://cdn.example/a.png" }, "another-workspace")).status, 404);
  assert.equal((await post({ url: "https://cdn.example/a.png" })).status, 403);
  assert.equal(calls.length, 0);
  assert.deepEqual(await deps.mediaRepo.list({ workspaceId: deps.workspaceId }), []);
});

test("invalid URL or metadata is rejected before fetching", async (t) => {
  const { post, calls } = await harness(t);
  for (const body of [{ url: "http://cdn.example/a.png" }, { url: "https://cdn.example/a.png", alt: 42 }, { url: [] }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal(calls.length, 0);
});

test("truncated or non-image downloads are rejected without persisting media", async (t) => {
  for (const response of [{ bodyBytesTruncated: true }, { bodyBytes: Buffer.from("<html>oops</html>") }]) {
    const { post, deps } = await harness(t, { response });
    assert.equal((await post({ url: "https://cdn.example/a.png" })).status, 400);
    assert.deepEqual(await deps.mediaRepo.list({ workspaceId: deps.workspaceId }), []);
  }
});

test("SSRF refusals expose only the caller-safe message and persist nothing", async (t) => {
  const { post, deps, logs } = await harness(t, { refusal: true });
  const { status, json } = await post({ url: "https://internal.example/a.png" });
  assert.equal(status, 400);
  assert.equal(json.error, "Target is not public");
  assert.ok(!JSON.stringify(json).includes("10.1.2.3"));
  assert.match(logs[0]!, /10\.1\.2\.3/);
  assert.deepEqual(await deps.mediaRepo.list({ workspaceId: deps.workspaceId }), []);
});

// Owner rule 2026-10-31 applies to EVERY path that stores a video, not only the direct upload: a video over
// the (here injected-small) threshold keeps its original and gains a web-safe copy. The real 50 MiB sits at the cap.
const MP4_VIDEO = Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from("ftypisom"), Buffer.from([0, 0, 0, 0]), Buffer.from("isomiso2avc1mp41")]);
const CONVERTED_MP4 = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypmp42"), 0, 0, 0, 0, ...Buffer.from("mp42isom")]);

test("admin URL import: a video over the import threshold is converted after it is stored and the original is kept", async (t) => {
  const inputs: Uint8Array[] = [];
  const notes: string[] = [];
  const { deps, post } = await harness(t, {
    response: { headers: { "content-type": "video/mp4" }, bodyBytes: MP4_VIDEO },
    videoImport: {
      ports: { transcoder: { transcode: async ({ input }) => { inputs.push(input); return { ok: true, bytes: CONVERTED_MP4 }; } } },
      reportNote: ({ note }) => { notes.push(note); },
      thresholdBytes: 10,
    },
  });
  const { status, json } = await post({ url: "https://cdn.example/Holiday.mp4", filename: "Holiday.mp4" });
  assert.equal(status, 201);
  assert.equal(inputs.length, 1, "the converter ran for the URL-imported video");
  const all = await deps.mediaRepo.list({ workspaceId: deps.workspaceId });
  assert.ok(all.some((item) => item.id === json.media.id), "the original the owner imported is kept and is what the response names");
  assert.equal(all.filter((item) => item.id !== json.media.id).length, 1, "one converted copy next to it");
  assert.deepEqual(notes, []);
});

test("admin URL import: a failed conversion keeps the original, the raw cause goes only to the operator note, and the response carries no raw error text", async (t) => {
  const notes: Array<{ note: string; cause: unknown }> = [];
  const { deps, post } = await harness(t, {
    response: { headers: { "content-type": "video/mp4" }, bodyBytes: MP4_VIDEO },
    videoImport: {
      ports: { transcoder: { transcode: async () => { throw new Error("spawn /opt/secret/ffmpeg ENOENT"); } } },
      reportNote: (note) => { notes.push(note); },
      thresholdBytes: 10,
    },
  });
  const { status, json } = await post({ url: "https://cdn.example/Holiday.mp4", filename: "Holiday.mp4" });
  assert.equal(status, 201);
  assert.equal((await deps.mediaRepo.list({ workspaceId: deps.workspaceId })).length, 1, "the original stays");
  assert.equal(notes.length, 1);
  assert.match((notes[0]!.cause as Error).message, /secret\/ffmpeg/, "the raw cause reaches the operator log");
  assert.doesNotMatch(notes[0]!.note, /secret|ENOENT|spawn/, "the owner-facing sentence is plain words");
  assert.doesNotMatch(JSON.stringify(json), /secret|ENOENT|spawn/);
});
