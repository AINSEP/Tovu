import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { sql } from "kysely";

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
let observer: ContentKernel;

before(async () => {
  const url = freshPostgresContentDatabase(DATABASE);
  first = openPostgresKernel<ContentDatabase>({ connectionString: url });
  second = openPostgresKernel<ContentDatabase>({ connectionString: url });
  observer = openPostgresKernel<ContentDatabase>({ connectionString: url });
});

after(async () => {
  await first?.close();
  await second?.close();
  await observer?.close();
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
  let holderPid = 0;
  const inA = first.transaction(async () => {
    [{ pid: holderPid }] = await first.query(sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`);
    const result = await repoA.appendRevision(revision(2));
    appended();
    await released;
    return result;
  });
  await appendedInA;

  let settled = false;
  let waiterPid!: (pid: number) => void;
  const waiterReady = new Promise<number>(resolve => { waiterPid = resolve; });
  const inB = second.transaction(async () => {
    const [{ pid }] = await second.query(sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`);
    waiterPid(pid);
    return repoB.appendRevision(revision(3));
  }).finally(() => { settled = true; });
  let waited = false;
  try {
    const pid = await Promise.race([waiterReady, inB.then(() => { throw new Error("append completed before its connection was observed"); })]);
    const deadline = Date.now() + 5000;
    while (!settled && Date.now() < deadline) {
      const [{ blocked }] = await observer.query(sql<{ blocked: boolean }>`SELECT ${holderPid} = ANY(pg_blocking_pids(${pid})) AS blocked`);
      if (blocked) { waited = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } finally {
    release();
    await Promise.allSettled([inA, inB]);
  }
  const [a, b] = await Promise.all([inA, inB]);
  assert.equal(waited, true, "Postgres must report B blocked by A before A is released");

  assert.equal(a.previousId, base.id);
  assert.equal(b.previousId, a.id);
  const chain = await repoB.listRevisions({ workspaceId: WS, postId: "p1" });
  assert.deepEqual(chain.map((row) => row.seq), [1, 2, 3]);
});
