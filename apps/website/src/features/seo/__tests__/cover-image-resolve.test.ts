/**
 * @file `resolveSeoCoverImage` / `withCoverReadDeps` against a hand-written featured-image port: a
 * body media ref only becomes the SEO cover when the ref validates AND names a live (non-trashed)
 * library asset; anything else is skipped so the next candidate (or no cover) wins.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { GetEntryMetaDeps } from "@jini-ai/cms/seo";
import { buildPostRecord } from "../../post/__tests__/post-record.fixture.js";
import { resolveSeoCoverImage, withCoverReadDeps } from "../cover-image.js";

const media = (assetId: string) => ({ type: "media", attrs: { assetId, alt: `${assetId} alt` } });

function depsWith(post: ReturnType<typeof buildPostRecord> | null): { deps: GetEntryMetaDeps; lookups: string[] } {
  const lookups: string[] = [];
  const assets: Record<string, { id: string; width: number; height: number; status: string } | null> = {
    gone: null,
    trash: { id: "trash", width: 10, height: 10, status: "trashed" },
    good: { id: "good", width: 1200, height: 630, status: "active" },
  };
  const deps = {
    postRepo: { findById: async () => post, isTrashed: () => false, extractPlainText: ({ html }: { html: string }) => html },
    media: { featuredImage: {
      resolveFeaturedImageRef: async ({ ref }: { ref: string }) => (ref === "bad" ? { ok: false } : { ok: true }),
      findMediaByIdOrSlug: async ({ idOrSlug }: { idOrSlug: string }) => { lookups.push(idOrSlug); return assets[idOrSlug] ?? null; },
    } },
  } as unknown as GetEntryMetaDeps;
  return { deps, lookups };
}

test("an invalid ref, a missing asset and a trashed asset are all skipped; the live asset becomes the cover", async () => {
  const post = buildPostRecord({ bodyJson: { type: "doc", content: [media("bad"), media("gone"), media("trash"), media("good")] } });
  const { deps, lookups } = depsWith(post);

  const cover = await resolveSeoCoverImage({ deps, post });

  assert.equal(cover?.mediaId, "good");
  assert.equal(lookups.includes("bad"), false, "an invalid ref is never looked up");
});

test("a body whose only media ref is unusable resolves no library cover", async () => {
  const post = buildPostRecord({ bodyJson: { type: "doc", content: [media("trash")] } });
  const { deps } = depsWith(post);
  assert.equal((await resolveSeoCoverImage({ deps, post }))?.mediaId, undefined);
});

test("withCoverReadDeps on a missing entry returns the deps untouched with no cover", async () => {
  const { deps } = depsWith(null);
  assert.deepEqual(await withCoverReadDeps({ deps, workspaceId: "workspace-1", entryId: "missing" }), { deps, cover: null, rawPost: null });
});

test("withCoverReadDeps binds a read-only post port that serves the projected row", async () => {
  const post = buildPostRecord({ featuredMediaId: "", bodyJson: { type: "doc", content: [media("good")] } });
  const { deps } = depsWith(post);
  const read = await withCoverReadDeps({ deps, workspaceId: post.workspaceId, entryId: post.id });
  assert.equal(read.rawPost, post);
  assert.equal((await read.deps.postRepo.findById({ workspaceId: post.workspaceId, id: post.id }))?.featuredMediaId, "good");
  assert.equal(read.deps.postRepo.extractPlainText({ html: "plain" } as never), "plain");
  assert.equal(read.deps.postRepo.isTrashed(post as never), false);
});
