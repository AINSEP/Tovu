import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import type { MediaTranscoderPort } from "@jini-ai/cms/media";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminMediaUploadRoute } from "#src/server/runtime/composition/modules/media";
import type { MediaRouteDeps } from "../deps.js";

/**
 * @file `POST .../media` with the owner's import rule (2026-10-31) wired in: a video over the threshold
 * keeps its original and gains a web-safe copy; a missing ffmpeg never fails the upload. The threshold
 * is injected small (the real 50 MiB sits at the upload cap, see `import-video-conversion.test.ts`).
 */

const WORKSPACE_ID = "workspace-local";
const MOV_AS_MP4 = Buffer.from([0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 2, 0, ...Buffer.from("isomiso2")]);
const CONVERTED = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypmp42"), 0, 0, 0, 0, ...Buffer.from("mp42isom")]);

function setup(transcode: MediaTranscoderPort["transcode"], optional: { thresholdBytes?: number } = {}) {
  const base = createRouteDeps();
  const deps: MediaRouteDeps = {
    tracker: createNoopTracker({}),
    workspaceId: base.workspaceId,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    removeMedia: base.removeMedia,
    forgetRemovedMedia: base.forgetRemovedMedia,
    clock: base.clock,
    idGen: base.idGen,
    mediaRepo: base.mediaRepo,
    assetBlobRepo: base.assetBlobRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    blobStore: base.blobStore,
    mediaContentTypeStore: base.mediaContentTypeStore,
    transformDefinitionRepo: base.transformDefinitionRepo,
    imageTransformer: base.imageTransformer,
    imageCodec: base.imageCodec,
  };
  const notes: string[] = [];
  const app = express();
  app.use(express.json({ limit: "75mb" }));
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminMediaUploadRoute({ app, deps }, { videoImport: {
    ports: { transcoder: { transcode } },
    reportNote: ({ note }) => { notes.push(note); },
    ...optional,
  } });
  return { app, deps, notes };
}

async function postVideo(t: import("node:test").TestContext, app: express.Express) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: "Holiday.mov", contentType: "video/mp4", dataBase64: MOV_AS_MP4.toString("base64") }),
  });
  return { status: res.status, json: await res.json() as { media: { id: string } } };
}

test("upload route: a video over the import threshold answers with the original and also stores a converted copy", async (t) => {
  const inputs: Uint8Array[] = [];
  const { app, deps, notes } = setup(async ({ input }) => { inputs.push(input); return { ok: true, bytes: CONVERTED }; }, { thresholdBytes: 10 });

  const { status, json } = await postVideo(t, app);

  assert.equal(status, 201);
  assert.equal(inputs.length, 1);
  assert.deepEqual(Buffer.from(inputs[0]!), MOV_AS_MP4);
  const all = await deps.mediaRepo.list({ workspaceId: WORKSPACE_ID });
  const copies = all.filter((item) => item.id !== json.media.id);
  assert.equal(copies.length, 1, "one converted copy next to the original");
  assert.equal(copies[0]!.description, 'Web-playable copy of "Holiday".');
  assert.ok(all.some((item) => item.id === json.media.id), "the original the owner uploaded is still there");
  assert.deepEqual(notes, []);
});

test("upload route: with no ffmpeg the upload is still created and the note is recorded instead", async (t) => {
  const { app, deps, notes } = setup(async () => ({ ok: false, reason: "unavailable", message: "Video conversion needs ffmpeg on this computer." }), { thresholdBytes: 10 });

  const { status, json } = await postVideo(t, app);

  assert.equal(status, 201);
  assert.deepEqual((await deps.mediaRepo.list({ workspaceId: WORKSPACE_ID })).map((item) => item.id), [json.media.id]);
  assert.equal(notes.length, 1);
  assert.match(notes[0]!, /needs ffmpeg on this computer/);
});

test("upload route: at Jini's own default threshold a small video is kept as uploaded and the converter is not touched", async (t) => {
  let calls = 0;
  const { app, deps } = setup(async () => { calls += 1; return { ok: true, bytes: CONVERTED }; });

  const { status } = await postVideo(t, app);

  assert.equal(status, 201);
  assert.equal(calls, 0);
  assert.equal((await deps.mediaRepo.list({ workspaceId: WORKSPACE_ID })).length, 1);
});
