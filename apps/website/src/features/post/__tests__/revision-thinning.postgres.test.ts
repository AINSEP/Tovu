import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createCleanupPreviewStore } from "@jini-ai/platform/retention";

import { openPostgresKernel } from "#src/platform/db/kernel/index";
import { freshPostgresContentDatabase } from "#src/platform/db/__tests__/postgres-database";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { PostRecord, PostRevisionInput } from "@jini-ai/cms/posts/post";
import { postRepoFor, postRevisionLockKey } from "../repo.js";
import { bindRevisionThinning } from "../revision-thinning.js";

/**
 * @file Revision thinning on a REAL Postgres server with two independent connections: an apply
 * waits on the post's revision fence while another connection's restore append is open, then sees
 * that append's `restored_from` and keeps its target. Without the fence, under READ COMMITTED the
 * apply reads the uncommitted append as absent and deletes the very row it restores from. Like
 * `repo.postgres.test.ts`, it fails (never skips) when the local server is down.
 */

const DATABASE = "tovu_post_revision_thinning_pg_fixture";
const WS = "ws-thin-pg";
const SCOPE = { workspaceId: WS, postId: "p1", kind: "post" } as const;

let first: ContentKernel;
let second: ContentKernel;

before(async () => {
  const url = freshPostgresContentDatabase(DATABASE);
  first = openPostgresKernel<ContentDatabase>({ connectionString: url });
  second = openPostgresKernel<ContentDatabase>({ connectionString: url });
});

after(async () => {
  await first?.close();
  await second?.close();
});

function revision(seq: number, restoredFrom?: string): PostRevisionInput {
  const recordedAt = `2026-0${seq}-01T00:00:00.000Z`;
  const state: PostRecord = {
    id: "p1", workspaceId: WS, title: `v${seq}`, slug: "p1", bodyJson: { type: "doc", content: [] }, bodyFormat: "doc",
    bodyHtml: null, status: "draft", kind: "post", updatedAt: recordedAt, version: seq,
  };
  return { postId: "p1", workspaceId: WS, seq, op: restoredFrom ? "restore" : "update", stateJson: state, actorId: "a", recordedAt, restoredFrom };
}

test("two connections: thinning apply waits for an open restore append and keeps its target", async () => {
  const repoA = postRepoFor(first, { mediaAccessEvidence: createMediaAccessEvidence() });
  const ids: string[] = [];
  for (let seq = 1; seq <= 4; seq++) ids.push((await repoA.appendRevision(revision(seq))).id);
  const never = async () => false;
  const binding = bindRevisionThinning({
    kernel: second, publishedRefs: never, restoreRefs: never, undoRefs: never, clock: () => Date.parse("2026-11-25T00:00:00.000Z"),
    previewStore: createCleanupPreviewStore({ randomToken: () => "pg-token", mono: () => 0 }), authorize: async () => {},
  }, {});
  const preview = await binding.preview({ principal: "owner", scope: SCOPE, before: "2026-11-01" }, {});

  let holding!: () => void, release!: () => void;
  const held = new Promise<void>((resolve) => { holding = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const writer = first.transaction(async () => {
    await first.lockKey(postRevisionLockKey(SCOPE, {}));
    holding();
    await gate;
    await repoA.appendRevision(revision(5, ids[1]));
  });
  await held;
  let settled = false;
  const applying = binding.apply({ principal: "owner", scope: SCOPE, previewToken: preview.previewToken, confirm: true }, {}).finally(() => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 200));
  // Released in `finally` so a failed wait assertion ends the open transaction instead of hanging.
  try { assert.equal(settled, false, "apply waits on the fence while the append is open"); } finally { release(); }
  await writer;
  const result = await applying;
  assert.deepEqual(result.deleted, [ids[0]]);
  assert.deepEqual(result.kept, [{ id: ids[1], reason: "isRestoredFrom" }]);
  assert.deepEqual((await repoA.listRevisions({ workspaceId: WS, postId: "p1" })).map((row) => row.id).slice(0, 3), ids.slice(1));
});
