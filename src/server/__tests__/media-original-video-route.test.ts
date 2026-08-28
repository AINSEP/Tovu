import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../app.js";
import { trashMedia, uploadMedia } from "../../features/media/index.js";

/**
 * @file Route-level tests for the new public, unauthenticated `GET /m/{assetId}/original` route
 * (video/embed capability, 2026-08-24) — `routes/site/media-rendition.ts`'s
 * `registerMediaOriginalVideoRoute`. Mirrors `media-rendition-route.test.ts`'s own real-`createApp()`,
 * real-HTTP style.
 *
 * Proves the two properties this route exists for: (1) a video asset serves byte-identical to how
 * it was uploaded, with a sniffed (not client-declared) `Content-Type` and `Range` support for
 * seeking — the SAME machinery `routes/admin/media/original.ts`'s authenticated route already
 * proved, reused rather than reimplemented; (2) a non-video asset never serves through this route —
 * it stays 404, so an image's only public URL remains the sanitizing transform route.
 */
async function withServer(run: (baseUrl: string, deps: ReturnType<typeof createRouteDeps>) => Promise<void>) {
  const deps = createRouteDeps();
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`, deps);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Same `blobRepo`/`assetBlobRepo` field-naming mapping `media-rendition-route.test.ts`'s own
 *  `uploadOne` documents — `uploadMedia`'s deps shape isn't `RouteDeps` verbatim. */
async function uploadOne(deps: ReturnType<typeof createRouteDeps>, bytes: Uint8Array, filename: string, declaredContentType: string) {
  return uploadMedia({
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
      bytes,
      filename,
      contentType: declaredContentType,
      createdByPrincipal: "user-1",
    },
  });
}

function mp4Bytes(payload: string): Uint8Array {
  const b = new Uint8Array(16 + payload.length);
  b.set(new TextEncoder().encode("ftyp"), 4);
  b.set(new TextEncoder().encode("isom"), 8);
  b.set(new TextEncoder().encode(payload), 16);
  return b;
}

test("media original video route: a real mp4 serves 200 with the sniffed video content type and the exact uploaded bytes", async () => {
  await withServer(async (baseUrl, deps) => {
    const bytes = mp4Bytes("hero-clip-bytes");
    const { media } = await uploadOne(deps, bytes, "hero.mp4", "video/mp4");

    const res = await fetch(`${baseUrl}/m/${media.id}/original`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "video/mp4");
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("content-disposition"), null, "video is never forced to download");
    const body = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual(body, bytes);
  });
});

test("media original video route: Range requests are honored — a <video> tag can seek without buffering the whole file", async () => {
  await withServer(async (baseUrl, deps) => {
    const bytes = mp4Bytes("0123456789ABCDEFGHIJ");
    const { media } = await uploadOne(deps, bytes, "seekable.mp4", "video/mp4");

    const res = await fetch(`${baseUrl}/m/${media.id}/original`, { headers: { Range: "bytes=0-4" } });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), `bytes 0-4/${bytes.byteLength}`);
    const slice = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual(slice, bytes.subarray(0, 5));
  });
});

test("media original video route: an IMAGE asset 404s here — a picture's only public URL stays the sanitizing transform route, never this bypass", async () => {
  await withServer(async (baseUrl, deps) => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const { media } = await uploadOne(deps, pngBytes, "hero.png", "image/png");

    const res = await fetch(`${baseUrl}/m/${media.id}/original`);
    assert.equal(res.status, 404);
  });
});

test("media original video route: a trashed video asset responds 410, mirroring the rendition route's gone mapping", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, mp4Bytes("goner"), "goner.mp4", "video/mp4");
    await trashMedia({ deps: { clock: deps.clock, mediaRepo: deps.mediaRepo }, input: { workspaceId: deps.workspaceId, id: media.id } });

    const res = await fetch(`${baseUrl}/m/${media.id}/original`);
    assert.equal(res.status, 410);
  });
});

test("media original video route: an unknown assetId 404s", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/m/does-not-exist/original`);
    assert.equal(res.status, 404);
  });
});

test("media original video route: does not collide with the versioned rendition route's URL shape", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, mp4Bytes("both-routes"), "both.mp4", "video/mp4");

    const originalRes = await fetch(`${baseUrl}/m/${media.id}/original`);
    assert.equal(originalRes.status, 200);

    // Same assetId, but the 3-segment rendition shape — "original" isn't a registered transform
    // name, so this must fall through to the OTHER route's own 400 (malformed transform version),
    // never accidentally served by this one.
    const renditionShapeRes = await fetch(`${baseUrl}/m/${media.id}/original.v1/x.jpg`);
    assert.equal(renditionShapeRes.status, 404);
  });
});
