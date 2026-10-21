import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import { InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, InMemoryMediaRepo, uploadMedia } from "../../media/index.js";
import { resolveFeaturedMediaIdForWrite, type FeaturedImageDeps } from "../featured-image.js";
import { PostValidationError } from "../post.js";

const WORKSPACE_ID = "ws-featured";

async function seededDeps(contentTypes?: Map<string, string>): Promise<{ deps: FeaturedImageDeps; mediaRepo: InMemoryMediaRepo; asset: { id: string; slug: string; sha256: string } }> {
  const mediaRepo = new InMemoryMediaRepo({});
  const bytes = new Uint8Array(await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer());
  const { media } = await uploadMedia({
    deps: {
      clock: { nowMs: () => Date.parse("2026-10-01T00:00:00.000Z") },
      idGen: { newId: () => "asset-1" },
      mediaRepo,
      blobRepo: new InMemoryAssetBlobRepo({}),
      renditionRepo: new InMemoryAssetRenditionRepo({}),
      blobStore: new InMemoryBlobStore(),
    },
    input: { workspaceId: WORKSPACE_ID, bytes, filename: "hero.png", contentType: "image/png", createdByPrincipal: "owner" },
  });
  const deps: FeaturedImageDeps = { mediaRepo, ...(contentTypes ? { mediaContentTypeStore: { getMany: async () => contentTypes } } : {}) };
  return { deps, mediaRepo, asset: { id: media.id, slug: media.slug, sha256: media.source.sha256 } };
}

test("omitted, null and blank featuredMediaId values pass through untouched", async () => {
  const { deps } = await seededDeps();
  for (const featuredMediaId of [undefined, null, "   "]) {
    assert.equal(await resolveFeaturedMediaIdForWrite({ deps, input: { workspaceId: WORKSPACE_ID, featuredMediaId } }), featuredMediaId);
  }
});

test("a media slug resolves to the canonical asset id that is stored", async () => {
  const { deps, asset } = await seededDeps();
  assert.equal(await resolveFeaturedMediaIdForWrite({ deps, input: { workspaceId: WORKSPACE_ID, featuredMediaId: ` ${asset.slug} ` } }), asset.id);
});

test("an unknown reference is a PostValidationError naming the trimmed reference", async () => {
  const { deps } = await seededDeps();
  await assert.rejects(
    resolveFeaturedMediaIdForWrite({ deps, input: { workspaceId: WORKSPACE_ID, featuredMediaId: " ghost " } }),
    (error: unknown) => error instanceof PostValidationError && error.message === "featuredMediaId: no media asset has the id 'ghost'.",
  );
});

test("a trashed asset is refused with how to fix it", async () => {
  const { deps, mediaRepo, asset } = await seededDeps();
  const stored = await mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: asset.id });
  await mediaRepo.save({ ...stored!, status: "trashed" });
  await assert.rejects(
    resolveFeaturedMediaIdForWrite({ deps, input: { workspaceId: WORKSPACE_ID, featuredMediaId: asset.id } }),
    (error: unknown) => error instanceof PostValidationError && error.message === `featuredMediaId: media asset '${asset.id}' is in Trash. Restore it first, or pick another image.`,
  );
});

test("an asset whose sniffed type is known and not an image is refused, naming that type", async () => {
  const { asset } = await seededDeps();
  const { deps } = await seededDeps(new Map([[asset.sha256, "application/pdf"]]));
  await assert.rejects(
    resolveFeaturedMediaIdForWrite({ deps, input: { workspaceId: WORKSPACE_ID, featuredMediaId: asset.id } }),
    (error: unknown) => error instanceof PostValidationError && error.message === `featuredMediaId: media asset '${asset.id}' is application/pdf, not an image. A featured image must be an image.`,
  );
});
