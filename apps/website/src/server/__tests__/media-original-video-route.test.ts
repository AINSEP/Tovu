import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { trashMedia, uploadMedia } from "../../features/media/index.js";
import type { PostRecord } from "../../features/post/index.js";
import type { MemberSessionRecord } from "../../features/members/index.js";
import { InMemoryMemberSessionRepo } from "../../features/members/index.js";

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

/** Same shape `content-post-get-by-slug.test.ts`'s own `makePost` uses. */
function makePost(overrides: Partial<PostRecord> & Pick<PostRecord, "id" | "slug">, workspaceId: string): PostRecord {
  return {
    workspaceId,
    title: "Untitled",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: "2026-09-03T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

/** Embeds `assetId` as a ref-based TipTap `image` node — the one shape
 *  `media-rendition.ts`'s own `collectImageAssetIds` walk recognizes. */
function imageBody(assetId: string): PostRecord["bodyJson"] {
  return { type: "doc", content: [{ type: "image", attrs: { assetId } }] };
}

const RAW_MEMBER_TOKEN = "test-raw-member-session-token-for-media-original-gating";
function activeMemberSession(workspaceId: string): MemberSessionRecord {
  return {
    id: "session-media-original-gating-test",
    workspaceId,
    memberId: "member-media-original-gating-test-1",
    tokenHash: createHash("sha256").update(RAW_MEMBER_TOKEN).digest("hex"),
    createdAt: "2026-09-03T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
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

test("media original video route: an anonymous caller is 404'd for a video whose ONLY referencing post is members-only, and an entitled signed-in member still gets it (ADR-030 §4, 2026-09-03 sweep)", async () => {
  await withServer(async (baseUrl, deps) => {
    const bytes = mp4Bytes("gated-clip-bytes");
    const { media } = await uploadOne(deps, bytes, "gated-hero.mp4", "video/mp4");
    await deps.postRepo.save(
      makePost(
        { id: "p-gated-video", slug: "gated-video-post", memberAccessJson: JSON.stringify({ visibility: "members" }), bodyJson: imageBody(media.id) },
        deps.workspaceId
      )
    );

    const anonRes = await fetch(`${baseUrl}/m/${media.id}/original`);
    assert.equal(anonRes.status, 404, "an anonymous caller must not read video embedded only in a members-only post");
    assert.equal(anonRes.headers.get("cache-control"), "private, no-store", "a per-viewer denial must never be shared-cached");
    const anonBody = (await anonRes.json()) as { error: string };
    assert.equal(anonBody.error, "video rendition not found", "must be indistinguishable from a non-video/unknown asset");

    deps.memberSessionRepo = new InMemoryMemberSessionRepo([activeMemberSession(deps.workspaceId)]);
    const memberRes = await fetch(`${baseUrl}/m/${media.id}/original`, {
      headers: { cookie: `tovu_member_session=${RAW_MEMBER_TOKEN}` },
    });
    assert.equal(memberRes.status, 200, "an entitled signed-in member must still get the real video");
    const body = new Uint8Array(await memberRes.arrayBuffer());
    assert.deepEqual(body, bytes);
  });
});

test("media original video route: an asset referenced only by a DRAFT post remains unrestricted for an anonymous caller", async () => {
  await withServer(async (baseUrl, deps) => {
    const bytes = mp4Bytes("draft-only-clip");
    const { media } = await uploadOne(deps, bytes, "draft.mp4", "video/mp4");
    await deps.postRepo.save(
      makePost(
        { id: "p-draft-video", slug: "draft-video-post", status: "draft", memberAccessJson: JSON.stringify({ visibility: "members" }), bodyJson: imageBody(media.id) },
        deps.workspaceId
      )
    );

    const res = await fetch(`${baseUrl}/m/${media.id}/original`);
    assert.equal(res.status, 200);
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
