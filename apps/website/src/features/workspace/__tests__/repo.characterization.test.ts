import assert from "node:assert/strict";
import { test } from "node:test";

import { RecordVersionConflictError } from "@jini-ai/core/optimistic-concurrency";

import { recordingKernel } from "#src/__tests__/lane-su-pins/support/recording-kernel";
import { SqliteWorkspaceRepo } from "../repo.sqlite.js";

/**
 * @file S1w T0: the workspace repo's behaviour on the unmoved code, before its query body moves to Jini
 * `@jini-ai/cms/workspace/sql`. Each test names the one-line mutation of `repo.ts` that turns it red; the
 * run's report holds the red output of each. Real SQLite kernel (the recorder from the lane-su pins).
 */

const ACME = { id: "ws-1", name: "Acme", slug: "acme", createdAt: "2026-07-15T00:00:00.000Z", version: 1 };

function workspace(id: string) {
  return { id, name: id, slug: `slug-${id}`, createdAt: "2026-07-15T00:00:00.000Z", version: 1 };
}

test("a stale expectedVersion is refused and leaves the row; without expectedVersion the last write wins", async () => {
  const repo = new SqliteWorkspaceRepo({ store: recordingKernel().kernel });
  await repo.insert(ACME);
  await repo.update({ ...ACME, name: "First", version: 2 }, { expectedVersion: 1 });
  await assert.rejects(
    repo.update({ ...ACME, name: "Stale", version: 2 }, { expectedVersion: 1 }),
    (error: unknown) => error instanceof RecordVersionConflictError && error.currentVersion === 2,
  );
  assert.equal((await repo.findById({ id: ACME.id }))?.name, "First");
  await repo.update({ ...ACME, name: "Last write", version: 9 });
  assert.deepEqual(await repo.findById({ id: ACME.id }), { ...ACME, name: "Last write", version: 9 });
});

test("the roster lock is the first thing taken inside the transaction, before the callback's statements", async () => {
  const { kernel, keys } = recordingKernel();
  const repo = new SqliteWorkspaceRepo({ store: kernel });
  assert.ok(repo.transaction, "the SQL repo serializes roster changes in a kernel transaction");
  await repo.transaction({ fn: async () => { keys.push("callback"); await repo.insert(ACME); } });
  assert.deepEqual(keys, ["workspace:roster", "callback"]);
});

test("findBySlug matches the slug exactly and returns null for an unknown one", async () => {
  const repo = new SqliteWorkspaceRepo({ store: recordingKernel().kernel });
  await repo.insert(workspace("a"));
  await repo.insert(workspace("b"));
  assert.equal((await repo.findBySlug({ slug: "slug-a" }))?.id, "a");
  assert.equal((await repo.findBySlug({ slug: "slug-b" }))?.id, "b");
  assert.equal(await repo.findBySlug({ slug: "slug" }), null);
  assert.equal(await repo.findBySlug({ slug: "slug-c" }), null);
});

test("list returns the rows in storage (insertion) order: the query has no ORDER BY today", async () => {
  const repo = new SqliteWorkspaceRepo({ store: recordingKernel().kernel });
  for (const id of ["ws-b", "ws-a", "ws-c"]) await repo.insert(workspace(id));
  assert.deepEqual((await repo.list()).map((row) => row.id), ["ws-b", "ws-a", "ws-c"]);
});
