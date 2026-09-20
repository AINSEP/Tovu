import assert from "node:assert/strict";
import test from "node:test";

import type { DomainEvent, OutboxPort } from "@jini-ai/cms/core";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import {
  createPost,
  deletePost,
  restorePostForward,
  updatePost,
  type PostRecord,
  type PostRepoPort,
} from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { SqlitePostRepo } from "../repo.sqlite.js";
import { removeVia } from "./remove-post-double.js";

/**
 * @file Certification of `restorePostForward` — the compensating undo every post `rollback` calls
 * after sol's 2026-09-20 High finding 3 ("rollback restores the current post row but leaves a ghost
 * revision and a ghost event behind").
 *
 * The end-to-end proof that the routes reach this lives in
 * `server/__tests__/admin-post-update-rollback-ledger.test.ts`. What is certified here is the
 * primitive's own contract, including the three stand-down branches an HTTP test cannot force, and
 * the deliberate deviation from `@jini-ai/cms` `command.ts:82` (the restored row moves FORWARD, it
 * is not restored verbatim including `version`).
 *
 * Rule of two: run against both `PostRepoPort` adapters, mirroring `post.revisions.test.ts`.
 */

const WS = "workspace-1";
const clock = { nowIso: () => "2026-09-20T12:00:00.000Z" };

function recordingOutbox(): OutboxPort & { events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  return {
    events,
    enqueue: async (event: DomainEvent) => void events.push(event),
    claimPending: async () => [],
    markDelivered: async () => {},
    markFailed: async () => {},
  };
}

/**
 * `RestorePostForwardDeps.forgetRemoved` — the Trash-index drop the undo of a trash performs. Both
 * adapters here hold no index of their own, so the recorded call IS the observable; the end-to-end
 * proof against a real `trashed_items` table lives in
 * `features/trash/__tests__/post-delete-undo-index.test.ts`.
 */
function recordingForget(): {
  forgetRemoved: (required: { workspaceId: string; id: string }) => Promise<void>;
  calls: Array<{ workspaceId: string; id: string }>;
} {
  const calls: Array<{ workspaceId: string; id: string }> = [];
  return { calls, forgetRemoved: async (required) => void calls.push(required) };
}

const ADAPTERS: Array<{ name: string; make: () => PostRepoPort }> = [
  { name: "InMemoryPostRepo", make: () => new InMemoryPostRepo() },
  { name: "SqlitePostRepo", make: () => new SqlitePostRepo(openContentDb(":memory:")) },
];

/** Reads the seeded row BACK through the repo, exactly as every real `captureInverse` does — an
 *  adapter materializes its nullable columns, and `createPost`'s returned record does not. */
async function seedPublishedPost(repo: PostRepoPort, outbox: OutboxPort): Promise<PostRecord> {
  await createPost({
    deps: { repo, clock, outbox },
    input: { workspaceId: WS, id: "post-1", title: "Original Title", status: "published" },
  });
  const seeded = await repo.findById({ workspaceId: WS, id: "post-1" });
  assert.ok(seeded, "the fixture post must have been created");
  return seeded;
}

for (const adapter of ADAPTERS) {
  test(`${adapter.name}: restores the prior state as a NEW version, with a "restore" revision naming what it came from`, async () => {
    const repo = adapter.make();
    const outbox = recordingOutbox();
    const { forgetRemoved, calls: forgotten } = recordingForget();
    const prior = await seedPublishedPost(repo, outbox);

    await updatePost({
      deps: { repo, clock, outbox, beforeSaveHook: undefined },
      input: {
        workspaceId: WS,
        id: prior.id,
        title: "Ghost Title",
        slug: prior.slug,
        bodyJson: prior.bodyJson,
        status: "draft",
      },
    });

    const restored = await restorePostForward({ deps: { repo, clock, outbox, forgetRemoved }, input: { prior } });
    assert.ok(restored, "a landed write must be compensable");

    // The deviation: NOT `prior.version`. The ghost revision already occupies that seq and
    // `appendRevision` is append-only, so the undo moves forward instead of reusing it.
    assert.equal(restored.post.version, prior.version + 2);
    assert.equal(restored.post.title, "Original Title");
    assert.equal(restored.post.status, "published");

    const current = await repo.findById({ workspaceId: WS, id: prior.id });
    assert.deepEqual(current, restored.post, "the row must be exactly what the compensation reports");
    assert.deepEqual(forgotten, [], "undoing an UPDATE must not touch a Trash index row it never wrote");

    const revisions = await repo.listRevisions({ workspaceId: WS, postId: prior.id });
    assert.deepEqual(
      revisions.map((revision) => [revision.seq, revision.op]),
      [
        [prior.version, "create"],
        [prior.version + 1, "update"],
        [prior.version + 2, "restore"],
      ],
      "every seq must map to exactly one state, and the undo must be recorded rather than erased"
    );
    const newest = revisions[2];
    assert.deepEqual(newest.stateJson, restored.post, "the restore revision must snapshot the row it wrote");
    assert.equal(
      newest.restoredFrom,
      revisions[0].id,
      "a restore row must name the revision it restored from, or the ledger says an undo happened but not back to what"
    );
  });

  test(`${adapter.name}: announces the compensating status transition the undo really is`, async () => {
    const repo = adapter.make();
    const outbox = recordingOutbox();
    const { forgetRemoved, calls: forgotten } = recordingForget();
    const prior = await seedPublishedPost(repo, outbox);

    await updatePost({
      deps: { repo, clock, outbox, beforeSaveHook: undefined },
      input: { workspaceId: WS, id: prior.id, title: "Ghost", slug: prior.slug, bodyJson: prior.bodyJson, status: "draft" },
    });
    outbox.events.length = 0;

    await restorePostForward({ deps: { repo, clock, outbox, forgetRemoved }, input: { prior } });

    assert.deepEqual(
      outbox.events.map((event) => event.name),
      ["entry.published"],
      "undoing a published->draft write must re-announce the row as published, not leave subscribers on the undone event"
    );
    assert.equal(
      outbox.events[0].id,
      `${prior.id}-entry.published-${prior.version + 2}`,
      "the event id is keyed on the version, so the forward version is also what keeps the compensating event from colliding with the original publish's"
    );
  });

  test(`${adapter.name}: undoing a trash clears the marker and re-announces the row as published`, async () => {
    const repo = adapter.make();
    const outbox = recordingOutbox();
    const { forgetRemoved, calls: forgotten } = recordingForget();
    const prior = await seedPublishedPost(repo, outbox);

    await deletePost({
      deps: { repo, clock, outbox, remove: removeVia(repo) },
      input: { workspaceId: WS, id: prior.id },
    });
    outbox.events.length = 0;

    const restored = await restorePostForward({ deps: { repo, clock, outbox, forgetRemoved }, input: { prior } });
    assert.ok(restored);
    assert.equal(restored.post.deletedAt ?? null, null, "the trash marker must be cleared");
    assert.deepEqual(
      outbox.events.map((event) => event.name),
      ["entry.published"],
      "a trashed row is not public whatever its stored status says, so undoing the trash republishes it"
    );
    assert.deepEqual(
      forgotten,
      [{ workspaceId: WS, id: prior.id }],
      "the index row the trash wrote must go with the marker, or the Trash lists a live post"
    );
  });

  test(`${adapter.name}: stands down when the write never landed`, async () => {
    const repo = adapter.make();
    const outbox = recordingOutbox();
    const { forgetRemoved, calls: forgotten } = recordingForget();
    const prior = await seedPublishedPost(repo, outbox);
    outbox.events.length = 0;

    assert.equal(
      await restorePostForward({ deps: { repo, clock, outbox, forgetRemoved }, input: { prior } }),
      null,
      "nothing advanced the row, so there is nothing to compensate"
    );
    const revisions = await repo.listRevisions({ workspaceId: WS, postId: prior.id });
    assert.equal(revisions.length, 1, "standing down must not append a revision");
    assert.equal(outbox.events.length, 0, "standing down must not announce anything");
  });

  test(`${adapter.name}: stands down when the row no longer exists`, async () => {
    const repo = adapter.make();
    const outbox = recordingOutbox();
    const { forgetRemoved, calls: forgotten } = recordingForget();
    const prior = await seedPublishedPost(repo, outbox);

    const vanished: PostRepoPort = Object.assign(Object.create(Object.getPrototypeOf(repo) as object), repo, {
      findById: async () => null,
    });
    assert.equal(
      await restorePostForward({ deps: { repo: vanished, clock, outbox, forgetRemoved }, input: { prior } }),
      null,
      "a row that has since been removed must not be resurrected by a compensation"
    );
  });

  test(`${adapter.name}: stands down rather than clobber a writer that landed after the compensation was assembled`, async () => {
    const repo = adapter.make();
    const outbox = recordingOutbox();
    const { forgetRemoved, calls: forgotten } = recordingForget();
    const prior = await seedPublishedPost(repo, outbox);

    await updatePost({
      deps: { repo, clock, outbox, beforeSaveHook: undefined },
      input: { workspaceId: WS, id: prior.id, title: "Ghost", slug: prior.slug, bodyJson: prior.bodyJson, status: "draft" },
    });
    outbox.events.length = 0;

    // A third writer lands between this compensation's read and its write — the window the
    // conditional `saveIfVersion` exists to close. Overwriting them would replace one unrecorded
    // mutation with another, which is the failure INV-01 exists to prevent.
    const raced: PostRepoPort = Object.assign(Object.create(Object.getPrototypeOf(repo) as object), repo, {
      findById: repo.findById.bind(repo),
      listRevisions: async (required: { workspaceId: string; postId: string }) => {
        await updatePost({
          deps: { repo, clock, outbox, beforeSaveHook: undefined },
          input: { workspaceId: WS, id: prior.id, title: "Third Writer", slug: prior.slug, bodyJson: prior.bodyJson, status: "draft" },
        });
        return repo.listRevisions(required);
      },
      saveIfVersion: repo.saveIfVersion.bind(repo),
      transaction: repo.transaction.bind(repo),
      appendRevision: repo.appendRevision.bind(repo),
    });

    assert.equal(
      await restorePostForward({ deps: { repo: raced, clock, outbox, forgetRemoved }, input: { prior } }),
      null,
      "a rejected conditional write must stand down, not force the restore"
    );
    const current = await repo.findById({ workspaceId: WS, id: prior.id });
    assert.equal(current?.title, "Third Writer", "the racing writer's row must survive untouched");
    const revisions = await repo.listRevisions({ workspaceId: WS, postId: prior.id });
    assert.equal(
      revisions.filter((revision) => revision.op === "restore").length,
      0,
      "a stood-down compensation must not append a restore revision for a write it did not make"
    );
  });
}
