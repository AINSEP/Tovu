import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { bootSiteDir, initSite } from "#src/server/runtime/composition/site-dir";
import { createPost } from "#src/features/post/index";
import { getMediaAccessEvidenceCache } from "#src/features/media/access-evidence";
import { POST_ENTITY_TYPE } from "../adapters/post.js";

/**
 * @file The real SQLite composition: Trash flips `posts.deleted_at` through the kernel, past the
 * post repository, and must still clear the media access evidence the repository clears on a save.
 */
test("Trash hide and restore clear the media access evidence once they commit", async t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "trash-media-evidence-"));
  const dir = path.join(parent, "site");
  await initSite({ dir, name: "Trash Evidence Site" });
  const boot = await bootSiteDir({ dir });
  let composed: { close(): Promise<void> } | undefined;
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
    db: boot.db, workspaceId: boot.workspaceId, onStoreOpened: store => { composed = store; },
    uploadsDir: path.join(dir, "uploads"), themesDir: path.join(dir, "themes"),
    siteBinding: { dir, name: "Trash Evidence Site", dirOverridden: true, switcherCompatible: false },
  });
  t.after(async () => { await closeSiteDirBoot(boot, composed); fs.rmSync(parent, { recursive: true, force: true }); });

  const workspaceId = boot.workspaceId;
  await createPost({ deps: { repo: deps.postRepo, clock: deps.clock }, input: { workspaceId, id: "gated-post", title: "Gated", slug: "gated-post", kind: "post" } });
  const post = await deps.postRepo.findById({ workspaceId, id: "gated-post" });
  const cache = getMediaAccessEvidenceCache({ postRepo: deps.postRepo });
  const remember = () => cache.set("asset", { expiresAt: Number.MAX_SAFE_INTEGER, value: Promise.resolve({ referencing: [], opaqueGated: [] }) });
  const target = { workspaceId, entityType: POST_ENTITY_TYPE, entityId: "gated-post", at: new Date().toISOString() };

  remember();
  const hidden = await deps.trash.trash({ ...target, expectedVersion: post!.version, actor: { principalId: "owner" }, display: { title: "Gated" } } as Parameters<typeof deps.trash.trash>[0]);
  assert.equal(hidden.ok, true);
  assert.equal(cache.size, 0, "hiding the post clears what visitors were decided on");

  remember();
  assert.equal(await deps.trash.restore(target), "restored");
  assert.equal(cache.size, 0, "restoring the post clears what visitors were decided on");
});
