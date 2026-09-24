import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminMediaListRoute } from "../../inbound/admin-http/routes/media/list.js";
import { registerAdminMediaUpdateRoute } from "../../inbound/admin-http/routes/media/update.js";
import { registerAdminMediaUploadRoute } from "../../inbound/admin-http/routes/media/upload.js";
import type { RouteDeps } from "../../routes/types.js";
import { uploadMedia } from "#src/features/media/index";

/**
 * @file The admin media LIST response's `contentType` field — the data half of the Media screen's
 * "Images"/"Videos" type filter.
 *
 * Before this suite, `AdminMediaResponse` carried no content type at all: `uploadMedia`
 * (`@jini-ai/cms/media`'s `media-service.ts`) validates the client-supplied `contentType` STRING
 * against an advisory allowlist and then discards it, and neither the `media` nor the `asset_blobs`
 * table had a column to put one in. The admin UI therefore could not tell an image from a video and
 * both type tabs rendered a "not wired up yet" placeholder.
 *
 * The invariant these tests pin is the one `routes/admin/media/original.ts`'s file header already
 * established for the byte-serving route, now extended to the list: the stored type is ALWAYS
 * `sniffContentType(bytes)` computed from the real uploaded bytes, NEVER the client's declared
 * upload string. Filtering on an attacker-controlled string that the serving route itself refuses
 * to trust would let an operator's "Images" tab disagree with the `Content-Type` the browser is
 * actually served.
 */

const WORKSPACE_ID = "workspace-local";

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = { ...createRouteDeps() };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminMediaUploadRoute(app, deps);
  registerAdminMediaListRoute(app, deps);
  registerAdminMediaUpdateRoute(app, deps);
  return { app, deps };
}

/** Uploads `bytes` verbatim under `declaredContentType` (default `"image/png"` — an allowed upload
 * type regardless of what the bytes really are), mirroring `media-original-route.test.ts`'s helper
 * of the same shape. */
async function uploadRawBytes(
  baseUrl: string,
  cookie: string,
  input: { filename: string; bytes: Uint8Array; declaredContentType?: string }
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      filename: input.filename,
      contentType: input.declaredContentType ?? "image/png",
      dataBase64: Buffer.from(input.bytes).toString("base64"),
    }),
  });
  assert.equal(res.status, 201, `upload of ${input.filename} should succeed`);
  const payload = (await res.json()) as { media: { id: string } };
  return payload.media.id;
}

async function listMediaContentTypes(
  baseUrl: string,
  cookie: string
): Promise<Map<string, string | null>> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const payload = (await res.json()) as { media: Array<{ id: string; contentType: string | null }> };
  return new Map(payload.media.map((m) => [m.id, m.contentType]));
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);

function mp4Bytes(): Uint8Array {
  const b = new Uint8Array(16);
  b.set(new TextEncoder().encode("ftyp"), 4);
  return b;
}

/** Minimal EBML header (`content-type-sniffer.ts`'s `EBML_SIGNATURE`) — enough for the sniffer to
 *  label these bytes `video/webm`, the same shape `mp4Bytes()` above uses for `video/mp4`. */
function webmBytes(): Uint8Array {
  return new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);
}

test("admin media list: carries the content type sniffed from the uploaded bytes", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const pngId = await uploadRawBytes(baseUrl, cookie, { filename: "hero.png", bytes: PNG_BYTES });
  // Declared `image/png` on purpose even though `video/mp4` is itself an allowed declared type
  // now (see the allowlist test at the bottom of this file) — this test's point is that the LIST
  // reports the SNIFFED type regardless of what was declared at upload, so declaring the "wrong"
  // allowed type here is what actually exercises that invariant.
  const mp4Id = await uploadRawBytes(baseUrl, cookie, { filename: "clip.mp4", bytes: mp4Bytes() });

  const types = await listMediaContentTypes(baseUrl, cookie);
  assert.equal(types.get(pngId), "image/png");
  assert.equal(types.get(mp4Id), "video/mp4");
});

test("admin media list: the stored content type comes from the BYTES, never the declared upload string", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Real PNG bytes, uploaded declaring `video/mp4`. `uploadMedia` only checks that the declared
  // string is in its allowlist, so this upload succeeds — and the list must report what the bytes
  // ARE (image/png), matching what `original.ts` will actually serve, not what the client claimed.
  const mediaId = await uploadRawBytes(baseUrl, cookie, {
    filename: "liar.gif",
    bytes: PNG_BYTES,
    declaredContentType: "image/gif",
  });

  const types = await listMediaContentTypes(baseUrl, cookie);
  assert.equal(types.get(mediaId), "image/png");
});

test("admin media list: unrecognized bytes are reported as application/octet-stream, not as an absent type", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // The upload route now rejects unrecognized bytes, so this stands in for a row stored before
  // that check: written straight through `uploadMedia`, its type is sniffed when the list backfills.
  const { media } = await uploadMedia({
    deps: {
      clock: deps.clock,
      idGen: deps.idGen,
      mediaRepo: deps.mediaRepo,
      blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo,
      blobStore: deps.blobStore,
    },
    input: {
      workspaceId: deps.workspaceId,
      bytes: new TextEncoder().encode("not a format this sniffer recognizes"),
      filename: "mystery.png",
      contentType: "image/png",
      createdByPrincipal: "seed-principal",
    },
  });
  const mediaId = media.id;

  const types = await listMediaContentTypes(baseUrl, cookie);
  assert.equal(
    types.get(mediaId),
    "application/octet-stream",
    "an unrecognized blob is a KNOWN unrecognized type, distinct from a row whose type was never recorded"
  );
});

test("admin media list: a metadata PATCH does not wipe the stored content type", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const mediaId = await uploadRawBytes(baseUrl, cookie, { filename: "hero.png", bytes: PNG_BYTES });

  const patchRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media/${mediaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ caption: "A striking hero shot" }),
  });
  assert.equal(patchRes.status, 200);

  // Regression guard for the repo-adapter wipe trap: `SqliteMediaRepo.save()`/
  // `SqliteAssetBlobRepo.save()` both build an EXPLICIT `values` object and `.set()` all of it on
  // update, so a column absent from that object is written back as its default on every edit.
  const types = await listMediaContentTypes(baseUrl, cookie);
  assert.equal(types.get(mediaId), "image/png");
});

/**
 * The backfill decision, proven end to end: media that already existed before the content-type
 * column did must NOT quietly disappear from the type tabs.
 *
 * `uploadMedia` is called DIRECTLY here, bypassing the upload route, which is exactly the shape of
 * a pre-existing row: bytes and a `media`/`asset_blobs` row exist, but nothing ever recorded a
 * content type for them. The list route must sniff the stored bytes, persist the answer, and
 * return it — so an old library becomes fully typed after one load of the Media screen rather than
 * accumulating a permanent untyped bucket.
 *
 * Backfilling from magic bytes is not a heuristic choice, it is the only possible one: the
 * original filename is never stored (`deriveTitleFromFilename` strips the extension before saving
 * `media.title`), so there is no extension to infer from. It is also the same source
 * `original.ts` already uses to set the response `Content-Type`, so a backfilled row's tab and its
 * served bytes cannot disagree.
 */
test("admin media list: backfills and persists the content type of a row that predates the column", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const { media } = await uploadMedia({
    deps: {
      clock: deps.clock,
      idGen: deps.idGen,
      mediaRepo: deps.mediaRepo,
      blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo,
      blobStore: deps.blobStore,
    },
    input: {
      workspaceId: deps.workspaceId,
      bytes: PNG_BYTES,
      filename: "legacy.png",
      contentType: "image/png",
      createdByPrincipal: "seed-principal",
    },
  });

  // Precondition: nothing recorded a type for this blob, so it is genuinely a pre-column row.
  const before = await deps.mediaContentTypeStore.getMany({
    workspaceId: deps.workspaceId,
    sha256s: [media.source.sha256],
  });
  assert.equal(before.has(media.source.sha256), false, "fixture must start with no recorded type");

  const types = await listMediaContentTypes(baseUrl, cookie);
  assert.equal(types.get(media.id), "image/png");

  // Persisted, not merely computed for that one response — the next list must not re-read bytes.
  const after = await deps.mediaContentTypeStore.getMany({
    workspaceId: deps.workspaceId,
    sha256s: [media.source.sha256],
  });
  assert.equal(after.get(media.source.sha256), "image/png");
});

/**
 * Pins the upload allowlist's current shape (`DEFAULT_ALLOWED_MIME_TYPES` in `@jini-ai/cms`'s
 * `media-service.ts`, Jini commit `18b629c4`, owner-directed 2026-08-24, plus `image/avif`
 * owner-directed 2026-09-06): `image/jpeg`, `image/png`, `image/webp`, `image/gif`,
 * `image/avif`, `video/mp4`, `video/webm`. Picking a
 * real `.mp4`/`.webm` in the admin's file input (where the browser sets `File.type` to
 * `video/mp4`/`video/webm`) is therefore accepted with a 201, so the "Videos" tab has ordinary
 * supply through the normal upload path.
 *
 * This replaces a stale prior version of this test (`bf530b1f`, same day but ~6 hours earlier)
 * that pinned `video/*` as REJECTED — accurate when written, but the allowlist was deliberately
 * widened later that day and this test was never updated to match. SVG stays excluded regardless
 * (never re-widened — it needs a sanitizer that doesn't exist yet, per `media-service.ts`'s own
 * comment), so that's the negative case kept below instead.
 */
test("admin media upload: video/mp4 and video/webm are accepted by the widened upload allowlist", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const mp4Res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      filename: "clip.mp4",
      contentType: "video/mp4",
      dataBase64: Buffer.from(mp4Bytes()).toString("base64"),
    }),
  });
  assert.equal(mp4Res.status, 201);

  const webmRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      filename: "clip.webm",
      contentType: "video/webm",
      dataBase64: Buffer.from(webmBytes()).toString("base64"),
    }),
  });
  assert.equal(webmRes.status, 201);
});

/**
 * The allowlist is a `Set` compared by exact string (`media-service.ts`'s
 * `allowedMimeTypes.has(input.contentType)`) against the client-supplied `contentType` field in
 * the JSON body — not the HTTP `Content-Type` header, and not the uploaded bytes. That match is
 * strict: no case-folding and no parameter stripping, so `VIDEO/MP4` or `video/mp4; codecs=avc1`
 * would themselves be rejected as unrecognized strings (fails closed, not a bypass). What DOES
 * still reject on purpose is any type never added to the Set — `image/svg+xml` is the durable
 * example, since SVG needs a sanitizer this pass doesn't have (`media-service.ts`'s file header).
 * This is the allowlist's one remaining negative case now that `video/*` moved to the accepted
 * side above.
 */
test("admin media upload: image/svg+xml is still rejected by the upload allowlist", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      filename: "icon.svg",
      contentType: "image/svg+xml",
      dataBase64: Buffer.from(new TextEncoder().encode("<svg></svg>")).toString("base64"),
    }),
  });
  assert.equal(res.status, 400);
  const payload = (await res.json()) as { error: string };
  assert.equal(payload.error, "content type 'image/svg+xml' is not allowed for upload");
});

/**
 * The real leading `ftyp` box of a genuine AVIF file: box size 24, `ftyp` tag, major brand
 * `avif`, zero minor version, then the `mif1`/`miaf` compatible brands, followed by the start of
 * the `meta` box. Taken from an actual `.avif` rather than synthesized, so this fixture proves
 * the sniffer against the byte layout real encoders emit.
 */
function avifBytes(): Uint8Array {
  return new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00,
    0x6d, 0x69, 0x66, 0x31, 0x6d, 0x69, 0x61, 0x66, 0x00, 0x00, 0x01, 0x68, 0x6d, 0x65, 0x74, 0x61,
  ]);
}

/**
 * Regression (2026-09-06) for the whole AVIF chain through the real admin upload route, which is
 * the same server path the assistant chat's `media_upload_asset` tool reaches. TWO defects had to
 * be fixed for this to pass and this test fails if EITHER regresses:
 *
 *  1. `image/avif` was missing from `DEFAULT_ALLOWED_MIME_TYPES`, so the route answered 400
 *     `content type 'image/avif' is not allowed for upload`.
 *  2. `content-type-sniffer.ts` identified ISO-BMFF purely by the `ftyp` tag, which AVIF shares
 *     with MP4, so an accepted AVIF was PERSISTED as `video/mp4` in `mediaContentTypeStore`.
 *     That store is the image-vs-video source of truth for both the admin type tabs and
 *     `widgets/resolver-service.ts`, so the asset would have rendered as an unplayable `<video>`
 *     on a public page — a worse outcome than the clean 400 it replaced. Asserting the persisted
 *     type (not merely the 201) is what makes this test catch defect 2 rather than tolerate it.
 */
test("admin media upload: a real AVIF is accepted and persisted as image/avif, not video/mp4", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // `uploadRawBytes` asserts the 201 itself — that half covers defect 1 (the allowlist).
  const mediaId = await uploadRawBytes(baseUrl, cookie, {
    filename: "ai-caps.avif",
    bytes: avifBytes(),
    declaredContentType: "image/avif",
  });

  // Defect 2: the type the server RECORDED from the bytes, which is what the admin type tabs and
  // `widgets/resolver-service.ts` both dispatch on. Before the sniffer fix this read `video/mp4`.
  const types = await listMediaContentTypes(baseUrl, cookie);
  assert.equal(types.get(mediaId), "image/avif");
});
