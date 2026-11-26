import { RESERVED_SEGMENTS } from "@jini-ai/cms/routing/site/reserved-paths";
import { MediaStillReferencedError } from "@jini-ai/cms/media";
import { createMediaTrashAdapter } from "@jini-ai/cms/trash/site/adapters/media";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { bootSiteDir, initSite } from "#src/server/runtime/composition/site-dir";
import { createPost } from "@jini-ai/cms/posts/post-create";
import { createApp } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerTransform, uploadMedia } from "#src/features/media/index";
import { POST_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/post";

/**
 * @file The real SQLite composition: Trash flips `posts.deleted_at` through the kernel, past the
 * post repository, and must still clear the media access evidence the repository clears on a save.
 */
/** Boots the real SQLite site composition (the production wiring of repos, trash service and route deps). */
async function bootComposedSite(t: TestContext) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "trash-media-evidence-"));
  const dir = path.join(parent, "site");
  await initSite({ dir, name: "Trash Evidence Site" });
  const boot = await bootSiteDir({ dir });
  let composed: { close(): Promise<void> } | undefined;
  const deps = await createSiteRouteDeps({}, { dbPath: path.join(dir, "content.db"), overrides: {
    db: boot.db, workspaceId: boot.workspaceId, onStoreOpened: ({ store }, _optional = {}) => { composed = store; },
    uploadsDir: path.join(dir, "uploads"), themesDir: path.join(dir, "themes"),
    siteBinding: { dir, name: "Trash Evidence Site", dirOverridden: true, switcherCompatible: false },
  } });
  t.after(async () => { await closeSiteDirBoot(boot, { composed }); fs.rmSync(parent, { recursive: true, force: true }); });
  return { deps, workspaceId: boot.workspaceId };
}

test("Trash hide and restore clear the media access evidence once they commit", async t => {
  const { deps, workspaceId } = await bootComposedSite(t);
  await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo: deps.postRepo, clock: deps.clock }, input: { workspaceId, id: "gated-post", title: "Gated", slug: "gated-post", kind: "post" } });
  const post = await deps.postRepo.findById({ workspaceId, id: "gated-post" });
  const cache = deps.mediaAccessEvidence.getCache({ postRepo: deps.postRepo });
  const remember = () => cache.set("asset", { expiresAt: Number.MAX_SAFE_INTEGER, value: Promise.resolve({ byAsset: new Map(), opaqueGated: new Set() }) });
  const target = { workspaceId, entityType: POST_ENTITY_TYPE, entityId: "gated-post", at: new Date().toISOString() };

  remember();
  const hidden = await deps.trash.trash({ ...target, expectedVersion: post!.version, actor: { principalId: "owner" }, display: { title: "Gated" } } as Parameters<typeof deps.trash.trash>[0]);
  assert.equal(hidden.ok, true);
  assert.equal(cache.size, 0, "hiding the post clears what visitors were decided on");

  remember();
  assert.equal(await deps.trash.restore(target), "restored");
  assert.equal(cache.size, 0, "restoring the post clears what visitors were decided on");
});

/** The reader and the writers must hold ONE evidence instance: a post save through the composed repo has to be
 *  visible to the public media-rendition route on its very next request, not after the 60 s cache expiry. Observed on
 *  the composition's own `deps.mediaAccessEvidence`: a reader built on any other instance leaves this cache empty. */
test("a post save through the composed repo is seen by the public media-rendition reader on the next request", async t => {
  const { deps, workspaceId } = await bootComposedSite(t);
  const baseUrl = await startTestServer(createApp(deps), t);
  await registerTransform({ deps: { clock: deps.clock, idGen: deps.idGen, transformRepo: deps.transformDefinitionRepo }, input: { workspaceId, name: "public", params: { format: "webp" }, owner: "core" } });
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>');
  const { media } = await uploadMedia({
    deps: { createHash, clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
    input: { workspaceId, createdByPrincipal: "user-1", bytes: svg, filename: "a.svg", contentType: "image/svg+xml" },
  });
  const url = `${baseUrl}/m/${media.id}/public.v1/image.webp`;
  const cache = deps.mediaAccessEvidence.getCache({ postRepo: deps.postRepo, entryRepo: deps.entryRepo });
  assert.equal(cache.size, 0, "nothing is cached before the first public request");
  const beforeSave = await fetch(url);
  assert.equal(beforeSave.status, 200);
  await beforeSave.arrayBuffer();
  assert.equal(cache.size, 1, "the rendition reader recorded its reference index in the composition's evidence instance");
  await deps.postRepo.save({ workspaceId, id: "gated", slug: "gated", title: "T", bodyJson: { type: "doc", content: [] }, status: "published", kind: "post", bodyFormat: "doc", bodyHtml: null, updatedAt: "2026-10-20T00:00:00.000Z", version: 1, featuredMediaId: media.id, memberAccessJson: JSON.stringify({ visibility: "members" }) } as Parameters<typeof deps.postRepo.save>[0]);
  assert.equal(cache.size, 0, "the save cleared the very instance the reader holds, so the gate re-evaluates on the next request");
  const afterSave = await fetch(url);
  assert.equal(afterSave.status, 404);
  assert.equal(afterSave.headers.get("cache-control"), "private, no-store");
});


test("a restore wins over a stale purge without deleting blobs", async t => {
  const { deps, workspaceId } = await bootComposedSite(t);
  const { media } = await uploadMedia({ deps: { createHash, clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
    input: { workspaceId, filename: "photo.svg", contentType: "image/svg+xml", bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>'), createdByPrincipal: "owner" } });
  let purges = 0;
  const adapter = createMediaTrashAdapter({ isReferencedError: ({ error }) => error instanceof MediaStillReferencedError,  db: deps.contentKernel!, purgeAsset: async () => { purges++; } });
  const hidden = await adapter.hide({ workspaceId, entityId: media.id, at: "2026-11-25T10:00:00.000Z", expectedVersion: null });
  assert.ok(hidden.ok);
  const restored = await adapter.unhide({ workspaceId, entityId: media.id, at: "2026-11-25T11:00:00.000Z", expectedVersion: hidden.version });
  assert.ok(restored.ok);
  assert.equal(await adapter.purge({ workspaceId, entityId: media.id, expectedVersion: hidden.version }), "version-changed");
  assert.equal(purges, 0);
  assert.ok(await deps.mediaRepo.findById({ workspaceId, id: media.id }));
});
