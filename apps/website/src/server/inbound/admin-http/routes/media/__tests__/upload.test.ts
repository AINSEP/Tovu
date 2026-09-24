import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { TOVU_MAX_UPLOAD_BYTES } from "#src/features/media/index";
import { registerAdminMediaUploadRoute } from "../upload.js";
import type { MediaRouteDeps } from "../deps.js";

/**
 * @file Unit-tier coverage for `POST .../media` (`registerAdminMediaUploadRoute`), same pattern as
 * `providers.test.ts` / `update.test.ts`: bare Express app, stubbed `res.locals.principal`, real
 * in-memory repos narrowed out of `createRouteDeps()`.
 *
 * Regression focus: `alt`/`caption`/`credit` go through the same `parseOptionalStringField` as
 * `update.ts`. On upload there is no existing value to preserve, so `null` and omitted already
 * collapse to the same stored `""` via `uploadMedia`'s `input.alt?.trim() ?? ""` — this file proves
 * that holds, and that a non-string/non-null value 400s here too (and does so through the route's
 * `try`/`catch`, not as an uncaught synchronous throw before it).
 */

const WORKSPACE_ID = "workspace-local";

// A 1x1 transparent PNG, minimal valid bytes so `uploadMedia`'s sniff/allowlist checks pass.
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/** The leading ISO-BMFF `ftyp` box of an MP4 (`isom` brand) — what the sniffer reads as video/mp4. */
const MP4_FTYP_HEADER = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

function buildApp(depsOverrides: Partial<MediaRouteDeps> = {}): express.Express {
  const base = createRouteDeps();
  const deps: MediaRouteDeps = {
    workspaceId: base.workspaceId,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: base.clock,
    idGen: base.idGen,
    mediaRepo: base.mediaRepo,
    assetBlobRepo: base.assetBlobRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    blobStore: base.blobStore,
    mediaContentTypeStore: base.mediaContentTypeStore,
    transformDefinitionRepo: base.transformDefinitionRepo,
    imageTransformer: base.imageTransformer,
    ...depsOverrides,
  };
  const app = express();
  // Above TOVU_MAX_UPLOAD_BYTES's own base64 inflation (~1.33x of 50 MiB as of 2026-09-21, ~67 MiB)
  // so an over-cap regression test is rejected by uploadMedia's own check, not this test app's parser.
  app.use(express.json({ limit: "75mb" }));
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminMediaUploadRoute(app, deps);
  return app;
}

async function upload(t: import("node:test").TestContext, app: express.Express, body: unknown) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("upload: alt: null uploads fine and stores empty string, same as omitted", async (t) => {
  const app = buildApp();
  const { status, json } = await upload(t, app, {
    filename: "pixel.png",
    contentType: "image/png",
    dataBase64: ONE_PIXEL_PNG_BASE64,
    alt: null,
  });
  assert.equal(status, 201);
  assert.equal(json.media.alt, "");
});

test("upload: caption: {} (non-string, non-null) is rejected with 400 and an exact message", async (t) => {
  const app = buildApp();
  const { status, json } = await upload(t, app, {
    filename: "pixel.png",
    contentType: "image/png",
    dataBase64: ONE_PIXEL_PNG_BASE64,
    caption: {},
  });
  assert.equal(status, 400);
  assert.equal(json.error, "media.caption must be a string or null, got object");
});

test("upload: credit omitted leaves it as empty string (unchanged default)", async (t) => {
  const app = buildApp();
  const { status, json } = await upload(t, app, {
    filename: "pixel.png",
    contentType: "image/png",
    dataBase64: ONE_PIXEL_PNG_BASE64,
  });
  assert.equal(status, 201);
  assert.equal(json.media.credit, "");
});

test("upload: dataBase64 with a character outside the alphabet is rejected with 400, not decoded leniently into an asset", async (t) => {
  const { mediaRepo } = createRouteDeps();
  const app = buildApp({ mediaRepo });
  const corrupted = `${ONE_PIXEL_PNG_BASE64.slice(0, 8)}$${ONE_PIXEL_PNG_BASE64.slice(8)}`;
  const { status, json } = await upload(t, app, {
    filename: "pixel.png",
    contentType: "image/png",
    dataBase64: corrupted,
  });
  assert.equal(status, 400);
  assert.deepEqual(json, { error: "dataBase64 is not valid base64" });

  const listed = await mediaRepo.list({ workspaceId: WORKSPACE_ID });
  assert.deepEqual(listed, [], "a rejected upload must not create a media row");
});

test("upload: a normal alt string value is stored trimmed", async (t) => {
  const app = buildApp();
  const { status, json } = await upload(t, app, {
    filename: "pixel.png",
    contentType: "image/png",
    dataBase64: ONE_PIXEL_PNG_BASE64,
    alt: "  A single pixel  ",
  });
  assert.equal(status, 201);
  assert.equal(json.media.alt, "A single pixel");
});

// Owner-directed 2026-09-21: the Tovu media-upload cap is 50 MiB. The bytes start with an MP4
// `ftyp` box so they pass the route's content sniff and reach uploadMedia's own size check.
test("upload: a file one byte over TOVU_MAX_UPLOAD_BYTES (50 MiB) is rejected with the new cap in the message", async (t) => {
  const app = buildApp();
  const oversized = Buffer.alloc(TOVU_MAX_UPLOAD_BYTES + 1);
  MP4_FTYP_HEADER.copy(oversized);
  const { status, json } = await upload(t, app, {
    filename: "clip.mp4",
    contentType: "video/mp4",
    dataBase64: oversized.toString("base64"),
  });
  assert.equal(status, 400);
  // Jini's uploadMedia states the cap in MB (Jini 754b0ff9), e.g. "50 MB" for 50 MiB.
  assert.equal(json.error, `uploaded file exceeds the ${TOVU_MAX_UPLOAD_BYTES / (1024 * 1024)} MB size cap`);
});

test("upload: SVG markup declared as image/png is rejected with 400 and nothing is stored", async (t) => {
  const { mediaRepo } = createRouteDeps();
  const app = buildApp({ mediaRepo });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>';
  const { status, json } = await upload(t, app, {
    filename: "pixel.png",
    contentType: "image/png",
    dataBase64: Buffer.from(svg, "utf8").toString("base64"),
  });
  assert.equal(status, 400);
  assert.deepEqual(json, { error: "the file's content (image/svg+xml) is not an allowed media type" });
  assert.deepEqual(await mediaRepo.list({ workspaceId: WORKSPACE_ID }), []);
});

test("upload: HTML declared as image/jpeg is rejected with 400", async (t) => {
  const app = buildApp();
  const { status, json } = await upload(t, app, {
    filename: "photo.jpg",
    contentType: "image/jpeg",
    dataBase64: Buffer.from("<!doctype html><script>alert(1)</script>", "utf8").toString("base64"),
  });
  assert.equal(status, 400);
  assert.deepEqual(json, { error: "the file's content (text/html) is not an allowed media type" });
});

test("upload: unrecognized bytes declared as image/png are rejected with 400", async (t) => {
  const app = buildApp();
  const { status, json } = await upload(t, app, {
    filename: "pixel.png",
    contentType: "image/png",
    dataBase64: Buffer.from("fake png", "utf8").toString("base64"),
  });
  assert.equal(status, 400);
  assert.deepEqual(json, { error: "the file's content (application/octet-stream) is not an allowed media type" });
});

test("upload: a real PNG mislabeled image/jpeg is stored as what its bytes are (image/png)", async (t) => {
  const app = buildApp();
  const { status, json } = await upload(t, app, {
    filename: "pixel.jpg",
    contentType: "image/jpeg",
    dataBase64: ONE_PIXEL_PNG_BASE64,
  });
  assert.equal(status, 201);
  assert.equal(json.media.contentType, "image/png");
});
