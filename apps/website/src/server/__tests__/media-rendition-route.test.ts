import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { registerTransform, uploadMedia, trashMedia, ImageSourceCorruptError } from "../../features/media/index.js";
import type { PostRecord } from "../../features/post/index.js";
import type { MemberSessionRecord } from "../../features/members/index.js";
import { InMemoryMemberSessionRepo } from "../../features/members/index.js";

/**
 * @file Route-level tests for the new public, unauthenticated
 * `GET /m/{assetId}/{transformName}.v{version}/{slug}.{ext}` rendition
 * serving route (ADR-027 §4 frozen URL contract) —
 * `routes/site/media-rendition.ts`. Boots the real `createApp()` against a
 * `createRouteDeps()` instance seeded directly (no HTTP round trip needed for
 * setup — `uploadMedia`/`registerTransform` are called straight against the
 * same deps object the app is booted with), then exercises the route over
 * real HTTP: cache headers, the frozen-URL cosmetic slug/ext behavior, the
 * latest-version-only anonymous-generation bound, and the trashed -> 410
 * mapping.
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

function bytesFrom(content: string): Uint8Array {
  return new TextEncoder().encode(content);
}

/**
 * `uploadMedia`'s `UploadMediaDeps` names its repo fields `blobRepo`/
 * `renditionRepo`; `RouteDeps` (what `createRouteDeps()` returns) names the
 * same repos `assetBlobRepo`/`assetRenditionRepo` — the admin upload route
 * (`routes/admin/media/upload.ts`) maps between the two by hand, and this
 * test helper mirrors that same mapping rather than passing `RouteDeps`
 * straight through (which is exactly what a bare pass-through did NOT
 * compile-time catch here, since both are plain object literals — this was
 * caught by a fresh test run, not by `tsc`).
 */
async function uploadOne(deps: ReturnType<typeof createRouteDeps>, content: string, filename = "a.png") {
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
      bytes: bytesFrom(content),
      filename,
      contentType: "image/png",
      createdByPrincipal: "user-1",
    },
  });
}

/** Same field-naming mismatch as {@link uploadOne}: `RegisterTransformDeps.transformRepo` vs
 * `RouteDeps.transformDefinitionRepo`. */
async function registerOne(
  deps: ReturnType<typeof createRouteDeps>,
  name: string,
  params: Parameters<typeof registerTransform>[0]["input"]["params"]
) {
  return registerTransform({
    deps: { clock: deps.clock, idGen: deps.idGen, transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, name, params, owner: "core" },
  });
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
  return { type: "doc", content: [{ type: "image", attrs: { assetId, transformName: "public" } }] };
}

const RAW_MEMBER_TOKEN = "test-raw-member-session-token-for-media-rendition-gating";
function activeMemberSession(workspaceId: string): MemberSessionRecord {
  return {
    id: "session-media-rendition-gating-test",
    workspaceId,
    memberId: "member-media-rendition-gating-test-1",
    tokenHash: createHash("sha256").update(RAW_MEMBER_TOKEN).digest("hex"),
    createdAt: "2026-09-03T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

test("media rendition route: an already-generated rendition serves 200 with the immutable long-lived Cache-Control", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, "hero-photo-bytes", "hero.png");
    const { definition } = await registerOne(deps, "thumb", { width: 100, height: 100, format: "webp" });

    const res = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/hero.webp`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(res.headers.get("content-type"), "image/webp");
    const body = new Uint8Array(await res.arrayBuffer());
    assert.ok(body.byteLength > 0);
  });
});

test("media rendition route: slug/ext are cosmetic — different slug/ext on the same (assetId, transformName, version) serve identical bytes", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, "cosmetic-test-bytes", "photo.png");
    const { definition } = await registerOne(deps, "square", { format: "jpeg" });

    const urlBase = `${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}`;
    const asHero = await fetch(`${urlBase}/hero-shot.jpg`);
    const asWhatever = await fetch(`${urlBase}/completely-different-name.jpeg`);

    assert.equal(asHero.status, 200);
    assert.equal(asWhatever.status, 200);
    const heroBytes = Buffer.from(await asHero.arrayBuffer());
    const whateverBytes = Buffer.from(await asWhatever.arrayBuffer());
    assert.ok(heroBytes.equals(whateverBytes), "lookup uses (assetId, transformName, version) only");
  });
});

test("media rendition route: an older, never-generated transform version is an uncacheable 404 (not lazily materialized), while the latest version generates on first request", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, "versioned-bytes", "v.png");
    const { definition: v1 } = await registerOne(deps, "banner", { format: "jpeg" });
    const { definition: v2 } = await registerOne(deps, "banner", { format: "webp" });

    const oldVersionRes = await fetch(`${baseUrl}/m/${media.id}/${v1.name}.v${v1.version}/b.jpg`);
    assert.equal(oldVersionRes.status, 404);
    // Was `public, max-age=60` until the 2026-09-05 fix. That short TTL was the entire tell in a
    // header-only existence oracle: a gate-denied 404 sends `private, no-store` (it depends on the
    // caller's session cookie and can never be shared-cacheable), so any caller could read "this
    // assetId exists and is gated" vs "does not exist" straight off `Cache-Control`. The two can
    // only be reconciled downwards. What this test pins — an older version is NOT lazily
    // materialized — is unchanged; only the negative-caching half moved.
    assert.equal(oldVersionRes.headers.get("cache-control"), "private, no-store");

    const latestVersionRes = await fetch(`${baseUrl}/m/${media.id}/${v2.name}.v${v2.version}/b.webp`);
    assert.equal(latestVersionRes.status, 200);
    assert.equal(latestVersionRes.headers.get("cache-control"), "public, max-age=31536000, immutable");
  });
});

test("media rendition route: a trashed asset's rendition responds 410 no-store, even for an already-generated rendition", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, "trashed-bytes", "t.png");
    const { definition } = await registerOne(deps, "avatar", { format: "png" });

    // Generate it while still active.
    const beforeTrash = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/a.png`);
    assert.equal(beforeTrash.status, 200);

    await trashMedia({ deps, input: { workspaceId: deps.workspaceId, id: media.id } });

    const afterTrash = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/a.png`);
    assert.equal(afterTrash.status, 410);
    assert.equal(afterTrash.headers.get("cache-control"), "no-store");
  });
});

test("media rendition route: a source blob the pixel pipeline cannot decode is a 422 no-store, never an opaque 500 (Defect 3 regression)", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, "looks-like-an-image-but-is-not-decodable", "corrupt.png");
    const { definition } = await registerOne(deps, "public", { format: "webp" });

    // Real defect: `sharp` accepted bytes that pass this package's own magic-byte sniff and the
    // upload allowlist, then rejected them at decode/re-encode time with `Input buffer has corrupt
    // header: ...`. Simulated here via the injected `imageTransformer` seam (the default test
    // composition root uses `InMemoryImageTransformer`, which never really decodes anything) rather
    // than depending on a real malformed image round-tripping through `sharp` in this route-level
    // test — `image-transformer.sharp.test.ts` already covers the real decoder's own failure mode.
    deps.imageTransformer = {
      transform: async () => {
        throw new ImageSourceCorruptError("the source image could not be decoded/re-encoded (target format 'webp'): simulated decode failure");
      },
    };

    const res = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/x.webp`);
    assert.equal(res.status, 422);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "source image could not be processed");
  });
});

test("media rendition route: unknown assetId is a 404, and a malformed transform spec is a 400", async () => {
  await withServer(async (baseUrl) => {
    const unknownAsset = await fetch(`${baseUrl}/m/does-not-exist/thumb.v1/a.jpg`);
    assert.equal(unknownAsset.status, 404);

    const malformed = await fetch(`${baseUrl}/m/does-not-exist/thumb-missing-version-marker/a.jpg`);
    assert.equal(malformed.status, 400);
  });
});

// --- member-gating regression suite (ADR-030 §4, 2026-09-03 sweep) --------------------------
// Closes the last hole the 2026-09-02/03 gating passes (`7fb47f55`, `9bf661e9`) left open: an
// image embedded in a members-only post's body stayed directly fetchable by URL even after the
// post itself 404'd to an anonymous caller. See `media-rendition.ts`'s `resolveMediaAccessDecision`
// for the derivation this uses (no asset->post foreign key exists; the gate walks published
// posts' `bodyJson` instead).

test("media rendition route: an anonymous caller is 404'd for a rendition whose ONLY referencing post is members-only, and an entitled signed-in member still gets it", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, "gated-hero-bytes", "gated-hero.png");
    const { definition } = await registerOne(deps, "public", { format: "webp" });
    await deps.postRepo.save(
      makePost(
        { id: "p-gated", slug: "gated-post", memberAccessJson: JSON.stringify({ visibility: "members" }), bodyJson: imageBody(media.id) },
        deps.workspaceId
      )
    );

    const anonRes = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/hero.webp`);
    assert.equal(anonRes.status, 404, "an anonymous caller must not read media embedded only in a members-only post");
    assert.equal(anonRes.headers.get("cache-control"), "private, no-store", "a per-viewer denial must never be shared-cached");
    const anonBody = (await anonRes.json()) as { error: string };
    assert.equal(anonBody.error, "rendition not found", "must be indistinguishable from an unknown assetId");

    deps.memberSessionRepo = new InMemoryMemberSessionRepo([activeMemberSession(deps.workspaceId)]);
    const memberRes = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/hero.webp`, {
      headers: { cookie: `tovu_member_session=${RAW_MEMBER_TOKEN}` },
    });
    assert.equal(memberRes.status, 200, "an entitled signed-in member must still get the real media");
    assert.equal(
      memberRes.headers.get("cache-control"),
      "private, no-store",
      "a gated asset's 200 must never get the long-lived shared/CDN cache header"
    );
    const bytes = new Uint8Array(await memberRes.arrayBuffer());
    assert.ok(bytes.byteLength > 0);
  });
});

test("media rendition route: an unrelated or malformed cookie header does not grant member access to a gated asset", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, "gated-bytes-unrelated-cookie", "gated2.png");
    const { definition } = await registerOne(deps, "public", { format: "webp" });
    await deps.postRepo.save(
      makePost(
        { id: "p-gated-cookie", slug: "gated-post-cookie", memberAccessJson: JSON.stringify({ visibility: "members" }), bodyJson: imageBody(media.id) },
        deps.workspaceId
      )
    );

    const res = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/g.webp`, {
      headers: { cookie: "malformed_cookie_with_no_equals_sign; some_other_cookie=some_value" },
    });
    assert.equal(res.status, 404, "a malformed or unrelated cookie header must not be mistaken for a member session");
  });
});

/**
 * Split in two by the 2026-09-05 takedown fix. The property this test was written to pin — a draft
 * does not RESTRICT an asset that would otherwise be freely servable — is unchanged and is the
 * first half below. The second half is the behavior that moved: this test used to seed a draft
 * carrying `visibility: "members"` and assert 200, which is exactly the hole finding 2 named —
 * reverting a live members-only post to draft as a takedown released its media to the public web,
 * with `public, max-age=31536000, immutable` stamped on it. A GATED draft now still gates.
 */
test("media rendition route: a PUBLIC draft's reference leaves its asset unrestricted, while a GATED draft still gates it — unpublishing is a takedown, not a release", async () => {
  await withServer(async (baseUrl, deps) => {
    const { definition } = await registerOne(deps, "public", { format: "webp" });

    const { media: publicDraftAsset } = await uploadOne(deps, "draft-only-bytes", "draft.png");
    await deps.postRepo.save(
      makePost({ id: "p-draft", slug: "draft-post", status: "draft", bodyJson: imageBody(publicDraftAsset.id) }, deps.workspaceId)
    );
    const publicDraftRes = await fetch(`${baseUrl}/m/${publicDraftAsset.id}/${definition.name}.v${definition.version}/d.webp`);
    assert.equal(publicDraftRes.status, 200, "a public draft-only reference must not gate the asset");
    assert.equal(publicDraftRes.headers.get("cache-control"), "public, max-age=31536000, immutable");

    const { media: gatedDraftAsset } = await uploadOne(deps, "gated-draft-bytes", "gated-draft.png");
    await deps.postRepo.save(
      makePost(
        {
          id: "p-draft-gated",
          slug: "draft-post-gated",
          status: "draft",
          memberAccessJson: JSON.stringify({ visibility: "members" }),
          bodyJson: imageBody(gatedDraftAsset.id),
        },
        deps.workspaceId
      )
    );
    const gatedDraftRes = await fetch(`${baseUrl}/m/${gatedDraftAsset.id}/${definition.name}.v${definition.version}/gd.webp`);
    assert.equal(gatedDraftRes.status, 404, "a members-only draft's media must not be anonymously fetchable");
    assert.equal(gatedDraftRes.headers.get("cache-control"), "private, no-store");
  });
});

test("media rendition route: an asset referenced only by a TRASHED post is not gated by that post — softDelete (post.ts) never clears `status`, so the trashed post still reads `status: \"published\"` and would otherwise still count as a live referrer (same defect pattern `caa116115c103630ba5253f9bbe3bceb234347d8` fixed for sitemap.xml/llms.txt)", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, "trashed-referrer-bytes", "trashed-ref.png");
    const { definition } = await registerOne(deps, "public", { format: "webp" });
    await deps.postRepo.save(
      makePost(
        {
          id: "p-trashed-gated",
          slug: "trashed-gated-post",
          memberAccessJson: JSON.stringify({ visibility: "members" }),
          bodyJson: imageBody(media.id),
          deletedAt: "2026-09-05T00:00:00.000Z",
        },
        deps.workspaceId
      )
    );

    const res = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/t.webp`);
    assert.equal(
      res.status,
      200,
      "a trashed post's stale reference must not gate the asset — no LIVE post references it, so it must be treated the same as an unreferenced asset"
    );
    assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
  });
});

test("media rendition route: an asset embedded in BOTH a public post and a members-only post is still servable to an anonymous caller (most-permissive-of-referrers — the bytes are already public through the public post)", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, "shared-asset-bytes", "shared.png");
    const { definition } = await registerOne(deps, "public", { format: "webp" });
    await deps.postRepo.save(makePost({ id: "p-public", slug: "public-post", bodyJson: imageBody(media.id) }, deps.workspaceId));
    await deps.postRepo.save(
      makePost(
        { id: "p-gated-shared", slug: "gated-post-shared", memberAccessJson: JSON.stringify({ visibility: "members" }), bodyJson: imageBody(media.id) },
        deps.workspaceId
      )
    );

    const res = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/s.webp`);
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("cache-control"),
      "public, max-age=31536000, immutable",
      "visible to everyone through the public post — ordinary immutable caching is correct here"
    );
  });
});
