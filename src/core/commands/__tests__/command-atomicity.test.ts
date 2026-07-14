import assert from "node:assert/strict";
import test from "node:test";

import { updatePost, InMemoryPostRepo, type PostRecord } from "../../../features/post";
import { executeCommand } from "../command";
import { InMemoryChangeSetRepo } from "../repo.memory";
import type {
  ChangeSetItemRecord,
  ChangeSetRecord,
  ChangeSetRepoPort,
  ChangeSetWithItems,
} from "../change-set";
import type { CommandMutation } from "../command";
import type { DomainEvent } from "../../ports";

/**
 * @file SPEC-001 REQ-01 / BR-04 / EC-08 / AC-17 — gateway atomicity.
 *
 * Proves the feature mutation and its change-set record commit as one unit of
 * work: if the record fails to persist after the mutation applied, the gateway
 * rolls the mutation back (compensating restore) so no change set and no outbox
 * event survive and the entity is unchanged (INV-01 — no mutation without a
 * record). Certifies the F4 audit delta over the in-memory adapter.
 */

const WORKSPACE = "workspace-1";
const POST_ID = "post-1";

const fixedClock = { nowIso: () => "2026-07-07T05:00:00.000Z" };

function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

function seededPost(): PostRecord {
  return {
    id: POST_ID,
    workspaceId: WORKSPACE,
    title: "Original title",
    slug: "original-slug",
    bodyJson: { type: "doc", text: "before" },
    status: "draft",
    updatedAt: "2026-07-01T00:00:00.000Z",
    version: 1,
  };
}

/** A no-op stand-in for `updatePost`'s own required `outbox` dep (SPEC-008/ADR-PIPE-008 Decision §5) — this
 * file's own gateway-level `outbox` fake (constructed per-test below) is a separate concern (the
 * `change-set.applied` event), so `postUpdateMutation`'s inner `updatePost` call gets its own. */
const postTransitionOutbox = { enqueue: async () => {} } as never;

/** Mirrors the post-update route's mutation, including the rollback seam. */
function postUpdateMutation(
  repo: InMemoryPostRepo,
  next: { title: string; slug: string; bodyJson: Record<string, unknown>; status: "draft" | "published" }
): CommandMutation<Awaited<ReturnType<typeof updatePost>>> {
  let priorPost: PostRecord | null = null;
  return {
    entityType: "post",
    entityId: POST_ID,
    operation: "update",
    captureInverse: async () => {
      priorPost = await repo.findById({ workspaceId: WORKSPACE, id: POST_ID });
      if (!priorPost) return null;
      return {
        title: priorPost.title,
        slug: priorPost.slug,
        bodyJson: priorPost.bodyJson,
        status: priorPost.status,
      };
    },
    execute: () =>
      updatePost({
        deps: { repo, clock: fixedClock, outbox: postTransitionOutbox },
        input: { workspaceId: WORKSPACE, id: POST_ID, ...next },
      }),
    captureEntityVersion: (r) => r.post.version,
    rollback: async () => {
      if (priorPost) await repo.save(priorPost);
    },
  };
}

/** A change-set repo whose record persistence always fails (injected EC-08 fault). */
class FailingChangeSetRepo implements ChangeSetRepoPort {
  async insert(_record: ChangeSetRecord, _items: ChangeSetItemRecord[]): Promise<void> {
    throw new Error("injected change-set persist failure");
  }
  async findById(): Promise<ChangeSetWithItems | null> {
    return null;
  }
  async findByIdempotencyKey(): Promise<ChangeSetRecord | null> {
    return null;
  }
  async listByWorkspace(): Promise<ChangeSetRecord[]> {
    return [];
  }
  async save(): Promise<void> {}
}

test("AC-17: injected change-set persist failure rolls back the post, no change set, no event", async () => {
  const repo = new InMemoryPostRepo([seededPost()]);
  const before = await repo.findById({ workspaceId: WORKSPACE, id: POST_ID });

  const enqueued: DomainEvent[] = [];
  const outbox = { enqueue: async (e: DomainEvent) => void enqueued.push(e) } as never;

  await assert.rejects(
    executeCommand({
      deps: { clock: fixedClock, idGen: counterIdGen(), changeSets: new FailingChangeSetRepo(), outbox },
      command: { workspaceId: WORKSPACE, actor: { id: "user-local", kind: "user" }, summary: "Update post" },
      mutation: postUpdateMutation(repo, {
        title: "Changed title",
        slug: "changed-slug",
        bodyJson: { type: "doc", text: "after" },
        status: "published",
      }),
    }),
    /injected change-set persist failure/
  );

  // Post unchanged — verbatim, including version (the mutation was rolled back).
  const after = await repo.findById({ workspaceId: WORKSPACE, id: POST_ID });
  assert.deepEqual(after, before);
  assert.equal(after?.version, 1);
  assert.equal(after?.title, "Original title");

  // No outbox event (enqueue sits after the record commit, which never happened).
  assert.equal(enqueued.length, 0);
});

test("happy path: record commits, post updated, exactly one change set + one event", async () => {
  const repo = new InMemoryPostRepo([seededPost()]);
  const changeSets = new InMemoryChangeSetRepo();

  const enqueued: DomainEvent[] = [];
  const outbox = { enqueue: async (e: DomainEvent) => void enqueued.push(e) } as never;

  const { result, changeSetId } = await executeCommand({
    deps: { clock: fixedClock, idGen: counterIdGen(), changeSets, outbox },
    command: { workspaceId: WORKSPACE, actor: { id: "user-local", kind: "user" }, summary: "Update post" },
    mutation: postUpdateMutation(repo, {
      title: "Changed title",
      slug: "changed-slug",
      bodyJson: { type: "doc", text: "after" },
      status: "published",
    }),
  });

  assert.equal(result.post.version, 2);
  assert.equal(result.post.title, "Changed title");

  const recorded = await changeSets.findById({ workspaceId: WORKSPACE, id: changeSetId });
  assert.ok(recorded, "change set persisted");
  assert.equal(recorded.changeSet.status, "applied");
  assert.equal(recorded.items.length, 1);
  assert.equal(recorded.items[0].entityVersionAtApply, 2);

  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].name, "change-set.applied");
});
