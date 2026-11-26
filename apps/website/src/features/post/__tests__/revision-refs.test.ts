import { schemaErasedKernel } from "#src/platform/db/content-kernel";
import assert from "node:assert/strict";
import { test } from "node:test";

import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import type { PostRecord } from "@jini-ai/cms/posts/post";
import type { ChangeSetItemRecord, ChangeSetStatus } from "@jini-ai/core/contracts/events/change-set";

import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqliteChangeSetRepo } from "#src/platform/db/sqlite/change-set-repo.sqlite";
import { postRepoFor } from "../repo.js";
import { postRevisionRefProbes } from "@jini-ai/cms/posts/sql/revision-refs";
import { postRevisionLockKey } from "@jini-ai/core/contracts/site/post-revision-lock";
import type { ThinnedRevision } from "@jini-ai/cms/posts/sql/revision-thinning";

/**
 * @file The three production reference probes revision thinning asks before it deletes a revision,
 * each against a real migrated SQLite content kernel: change-set items naming a revision (undo), a
 * pending inverse payload a restore would read back by `seq` (restore), and the post's live or
 * scheduled published snapshot (published). Unknown or unreadable state keeps the revision.
 */

const WS = "ws-refs";
const SCOPE = { workspaceId: WS, postId: "p1", kind: "post" } as const;

function post(version: number, extra: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "p1", workspaceId: WS, title: `v${version}`, slug: "p1", bodyJson: { type: "doc", content: [] }, bodyFormat: "doc",
    bodyHtml: null, status: "draft", kind: "post", updatedAt: `2026-0${version}-01T00:00:00.000Z`, version, ...extra,
  };
}

async function fixture() {
  const kernel = freshSqliteContentKernel();
  const repo = postRepoFor(kernel, { mediaAccessEvidence: createMediaAccessEvidence() });
  const revisions: ThinnedRevision[] = [];
  for (let seq = 1; seq <= 4; seq++) {
    const state = post(seq);
    const { id } = await repo.appendRevision({ postId: "p1", workspaceId: WS, seq, op: "update", stateJson: state, actorId: "a", recordedAt: state.updatedAt });
    revisions.push({ id, seq, recordedAt: state.updatedAt, restoredFrom: null });
  }
  const changeSets = new SqliteChangeSetRepo({ store: kernel });
  let n = 0;
  const changeSet = async (item: Partial<ChangeSetItemRecord>, { status = "applied", workspaceId = WS }: { status?: ChangeSetStatus; workspaceId?: string } = {}) => {
    const id = `cs-${++n}`;
    await changeSets.insert({
      record: { id, workspaceId, actorId: "a", status, summary: "edit", createdAt: "2026-05-01T00:00:00.000Z" },
      items: [{ id: `csi-${n}`, changeSetId: id, entityType: "post", entityId: "p1", operation: "update", position: 0, ...item }],
    });
  };
  const probes = postRevisionRefProbes({ kernel: schemaErasedKernel({ store: kernel }) }, {});
  const ask = (probe: keyof typeof probes, at: number) => probes[probe]({ scope: SCOPE, revision: revisions[at]! }, {});
  return { kernel, repo, revisions, changeSet, ask };
}

test("undoRefs: a change-set item naming the revision before or after keeps it", async () => {
  const f = await fixture();
  await f.changeSet({ beforeRevisionId: f.revisions[0]!.id });
  await f.changeSet({ afterRevisionId: f.revisions[1]!.id });
  await f.changeSet({ beforeRevisionId: f.revisions[2]!.id }, { workspaceId: "ws-other" });
  assert.equal(await f.ask("undoRefs", 0), true);
  assert.equal(await f.ask("undoRefs", 1), true);
  assert.equal(await f.ask("undoRefs", 2), false, "another workspace's change set names nothing here");
  assert.equal(await f.ask("undoRefs", 3), false);
});

test("restoreRefs: a pending inverse payload at the revision's seq keeps it; a reverted one does not", async () => {
  const f = await fixture();
  await f.repo.save(post(4));
  await f.changeSet({ inversePayload: post(1) as never });
  await f.changeSet({ inversePayload: post(2) as never }, { status: "reverted" });
  assert.equal(await f.ask("restoreRefs", 0), true, "an applied change set can still be undone back to seq 1");
  assert.equal(await f.ask("restoreRefs", 1), false, "a reverted change set is no longer pending");
  assert.equal(await f.ask("restoreRefs", 2), true, "the latest write's prior state is what an in-flight rollback reads back");
});

test("restoreRefs: unreadable payload or unknown status keeps the revision (fail closed)", async () => {
  const f = await fixture();
  await f.repo.save(post(4));
  await f.kernel.run((db) => db.insertInto("change_sets").values({ id: "cs-x", workspace_id: WS, actor_id: "a", status: "applied", summary: "x", created_at: "2026-05-01" } as never).execute());
  await f.kernel.run((db) => db.insertInto("change_set_items").values({ id: "csi-x", change_set_id: "cs-x", entity_type: "post", entity_id: "p1", operation: "update", inverse_payload_json: "{not json", position: 0 } as never).execute());
  assert.equal(await f.ask("restoreRefs", 0), true, "unparseable inverse payload");
  const g = await fixture();
  await g.repo.save(post(4));
  await g.changeSet({ inversePayload: post(1) as never }, { status: "someday" as ChangeSetStatus });
  assert.equal(await g.ask("restoreRefs", 0), true, "unknown change-set status");
  assert.equal(await g.ask("restoreRefs", 1), false);
});

test("publishedRefs: the live or scheduled published snapshot keeps its revision; a draft does not", async () => {
  const f = await fixture();
  await f.repo.save(post(3, { status: "published" }));
  assert.equal(await f.ask("publishedRefs", 2), true, "live snapshot");
  assert.equal(await f.ask("publishedRefs", 1), false);
  await f.repo.save(post(4, { status: "published", publishAt: "2027-01-01T00:00:00.000Z" }));
  assert.equal(await f.ask("publishedRefs", 3), true, "scheduled snapshot");
  const g = await fixture();
  await g.repo.save(post(4));
  assert.equal(await g.ask("publishedRefs", 3), false, "a draft serves nothing");
});

test("a probe that cannot read throws, so the engine keeps the revision", async () => {
  const f = await fixture();
  await f.kernel.run((db) => db.schema.dropTable("change_set_items").execute());
  await assert.rejects(f.ask("undoRefs", 0));
  await assert.rejects(f.ask("restoreRefs", 0));
});

test("change-set insert takes the post revision fence for items naming a revision", async () => {
  const f = await fixture();
  const keys: string[] = [];
  const lockKey = f.kernel.lockKey.bind(f.kernel);
  f.kernel.lockKey = async (key: string) => { keys.push(key); return lockKey(key); };
  await f.changeSet({ beforeRevisionId: f.revisions[0]!.id });
  await f.changeSet({ afterRevisionId: f.revisions[1]!.id }, { workspaceId: "ws-b" });
  await f.changeSet({});
  await f.changeSet({ entityType: "menu", entityId: "m1", beforeRevisionId: "menu-rev-1" });
  assert.deepEqual(keys, [postRevisionLockKey(SCOPE, {}), postRevisionLockKey({ workspaceId: "ws-b", postId: "p1" }, {})]);
});
