import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { registerTransform, uploadMedia, trashMedia, ImageSourceCorruptError } from "../../features/media/index.js";

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

test("media rendition route: an older, never-generated transform version is a short-TTL 404 (not lazily materialized), while the latest version generates on first request", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, "versioned-bytes", "v.png");
    const { definition: v1 } = await registerOne(deps, "banner", { format: "jpeg" });
    const { definition: v2 } = await registerOne(deps, "banner", { format: "webp" });

    const oldVersionRes = await fetch(`${baseUrl}/m/${media.id}/${v1.name}.v${v1.version}/b.jpg`);
    assert.equal(oldVersionRes.status, 404);
    assert.equal(oldVersionRes.headers.get("cache-control"), "public, max-age=60");

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
