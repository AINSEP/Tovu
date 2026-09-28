import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { openPostgresKernel } from "#src/platform/db/kernel/index";
import { freshPostgresContentDatabase } from "#src/platform/db/__tests__/postgres-database";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { PostRecord, PostRevisionInput } from "../post.js";
import { postRepoFor } from "../repo.js";

/**
 * @file The post repo on a REAL Postgres server with two independent connections: the claim in
 * `appendRevision`'s doc — no other append lands between its read of the latest revision and its
 * insert — holds under READ COMMITTED because of `lockKey`, not because of the transaction alone.
 * Without the lock the second append reads no previous row (the first is uncommitted) and the chain
 * forks. Fails (never skips) when the local server is down.
 */

const DATABASE = "tovu_post_repo_pg_fixture";
const WS = "ws-pg";

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

function revision(seq: number): PostRevisionInput {
  const state: PostRecord = {
    id: "p1",
    workspaceId: WS,
    title: `v${seq}`,
    slug: "p1",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "draft",
    kind: "post",
    updatedAt: "2026-09-28T00:00:00.000Z",
    version: seq,
  };
  return { postId: "p1", workspaceId: WS, seq, op: "update", stateJson: state, actorId: "a", recordedAt: state.updatedAt };
}

test("two connections: a concurrent appendRevision waits for the open one and chains after it", async () => {
  const repoA = postRepoFor(first);
  const repoB = postRepoFor(second);
  const base = await repoA.appendRevision(revision(1));

  let appended!: () => void;
  const appendedInA = new Promise<void>((resolve) => (appended = resolve));
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  // A caller's own transaction around the append (as updatePost does): the lock is held to its end.
  const inA = first.transaction(async () => {
    const result = await repoA.appendRevision(revision(2));
    appended();
    await released;
    return result;
  });
  await appendedInA;

  let settled = false;
  const inB = repoB.appendRevision(revision(3)).finally(() => (settled = true));
  await new Promise((resolve) => setTimeout(resolve, 150));
  // Read before releasing, assert after: a failure must not leave A's transaction open (the pool
  // would keep the test process alive).
  const waited = !settled;
  release();
  assert.equal(waited, true, "the second connection's append must wait for the first transaction");

  const a = await inA;
  const b = await inB;
  assert.equal(a.previousId, base.id);
  assert.equal(b.previousId, a.id);
  const chain = await repoB.listRevisions({ workspaceId: WS, postId: "p1" });
  assert.deepEqual(chain.map((row) => row.seq), [1, 2, 3]);
});
