import assert from "node:assert/strict";
import test from "node:test";

import type { ChangeSetItemRecord, ChangeSetRecord, DomainEvent, OutboxPort } from "@jini-ai/cms/core";
import { revertChangeSet } from "#src/contracts/core/commands/index";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/repo.memory";
import { announceDueGoLives } from "../go-live.js";
import type { PostRecord } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { createPostRevertRegistry } from "../reverters.js";
import { buildPostRecord } from "./post-record.fixture.js";

/**
 * @file History / Trash undo of a SCHEDULED post (review fix, 2026-10-21): both post reverters run
 * through `revertChangeSet` — the path the admin History "Undo" and a Trash undo of a recorded
 * delete take — and emit through the same schedule-aware logic as every save. Restoring a row whose
 * `publishAt` is still ahead announces nothing; the go-live sweep announces it when it passes.
 */

const WS = "ws-1";
const SAVED = "2026-10-21T10:00:00.000Z";
const GO_LIVE = "2026-10-21T12:00:00.000Z";
const LATER = "2026-10-21T13:00:00.000Z";
const GO_LIVE_ID = `p1-entry.published-at-${GO_LIVE}`;

/** Records ids; a repeated id is a no-op, like both real outboxes. */
function recordingOutbox(): OutboxPort & { ids: string[] } {
  const ids: string[] = [];
  return {
    ids,
    enqueue: async (event: DomainEvent) => { if (!ids.includes(event.id)) ids.push(event.id); },
    claimPending: async () => [],
    markDelivered: async () => {},
    markFailed: async () => {},
  };
}

const row = (fields: Partial<PostRecord> = {}) =>
  buildPostRecord({ id: "p1", workspaceId: WS, slug: "p1", status: "published", publishAt: GO_LIVE, updatedAt: SAVED, version: 2, ...fields });

/** Reverts a one-item applied change set at `nowIso`, through the real registry and `revertChangeSet`. */
async function undo(required: { repo: InMemoryPostRepo; outbox: OutboxPort; nowIso: string; item: Pick<ChangeSetItemRecord, "operation" | "inversePayload"> }) {
  const { repo, outbox, nowIso, item } = required;
  const clock = { nowMs: () => Date.parse(nowIso) };
  const changeSet: ChangeSetRecord = { id: "cs-1", workspaceId: WS, status: "applied", summary: "edit p1", createdAt: SAVED, appliedAt: SAVED };
  const changeSets = new InMemoryChangeSetRepo([changeSet], [{ id: "csi-1", changeSetId: "cs-1", entityType: "post", entityId: "p1", entityVersionAtApply: 2, position: 0, ...item }]);
  const registry = createPostRevertRegistry({ postRepo: repo, clock, outbox, forgetRemoved: async () => {} });
  await revertChangeSet({ deps: { changeSets, registry, clock, idGen: { newId: () => "id-1" } }, input: { workspaceId: WS, changeSetId: "cs-1" } });
}

const scheduledPreImage = { title: "Scheduled", slug: "p1", bodyJson: { type: "doc", content: [] }, status: "published", publishAt: GO_LIVE };
const sweep = (repo: InMemoryPostRepo, outbox: OutboxPort, nowIso: string) => announceDueGoLives({ deps: { repo, outbox }, input: { workspaceId: WS, nowIso } });

test("History undo restoring a still-scheduled pre-image emits nothing; the sweep announces it at go-live", async () => {
  const repo = new InMemoryPostRepo([row({ status: "draft", publishAt: null })]);
  const outbox = recordingOutbox();
  await undo({ repo, outbox, nowIso: SAVED, item: { operation: "update", inversePayload: scheduledPreImage } });
  assert.deepEqual(outbox.ids, [], "embargoed until go-live");
  await sweep(repo, outbox, GO_LIVE);
  assert.deepEqual(outbox.ids, [GO_LIVE_ID]);
});

test("History undo of a row that went live unannounced announces the go-live before it moves updatedAt", async () => {
  const repo = new InMemoryPostRepo([row()]);
  const outbox = recordingOutbox();
  await undo({ repo, outbox, nowIso: LATER, item: { operation: "update", inversePayload: { ...scheduledPreImage, status: "draft" } } });
  assert.deepEqual(outbox.ids, [GO_LIVE_ID, "p1-entry.unpublished-3"]);
});

test("Trash undo of a still-scheduled post emits nothing; the sweep announces it at go-live", async () => {
  const repo = new InMemoryPostRepo([row({ deletedAt: SAVED })]);
  const outbox = recordingOutbox();
  await undo({ repo, outbox, nowIso: SAVED, item: { operation: "delete", inversePayload: { deletedAt: null } } });
  assert.equal((await repo.findById({ workspaceId: WS, id: "p1" }))?.deletedAt, null, "restored");
  assert.deepEqual(outbox.ids, []);
  await sweep(repo, outbox, GO_LIVE);
  assert.deepEqual(outbox.ids, [GO_LIVE_ID]);
});

test("Trash undo after the scheduled time passed publishes it now", async () => {
  const repo = new InMemoryPostRepo([row({ deletedAt: SAVED })]);
  const outbox = recordingOutbox();
  await undo({ repo, outbox, nowIso: LATER, item: { operation: "delete", inversePayload: { deletedAt: null } } });
  assert.deepEqual(outbox.ids, ["p1-entry.published-3"]);
});

test("an undo whose event enqueue fails rolls the restore back", async () => {
  const repo = new InMemoryPostRepo([row({ deletedAt: SAVED, publishAt: null })]);
  const outbox = { ...recordingOutbox(), enqueue: async () => { throw new Error("outbox unavailable"); } };
  await assert.rejects(undo({ repo, outbox, nowIso: LATER, item: { operation: "delete", inversePayload: { deletedAt: null } } }), /outbox unavailable/);
  assert.equal((await repo.findById({ workspaceId: WS, id: "p1" }))?.deletedAt, SAVED, "still in the Trash");
});

test("both reverters' currentActor: the actor of the current revision, else null (missing row or ledger)", async () => {
  const repo = new InMemoryPostRepo([row()]);
  const reverters = createPostRevertRegistry({ postRepo: repo, clock: { nowMs: () => Date.parse(SAVED) }, outbox: recordingOutbox(), forgetRemoved: async () => {} });
  const update = reverters.resolve("post", "update")!;
  const remove = reverters.resolve("post", "delete")!;
  assert.equal(await update.currentActor!({ workspaceId: WS, entityId: "p1" }), null, "no ledger row at the current version");
  await repo.appendRevision({ postId: "p1", workspaceId: WS, seq: 2, op: "update", stateJson: row(), actorId: "editor-1", recordedAt: SAVED });
  assert.equal(await update.currentActor!({ workspaceId: WS, entityId: "p1" }), "editor-1");
  assert.equal(await remove.currentActor!({ workspaceId: WS, entityId: "p1" }), "editor-1");
  assert.equal(await remove.currentActor!({ workspaceId: WS, entityId: "missing" }), null);
});
