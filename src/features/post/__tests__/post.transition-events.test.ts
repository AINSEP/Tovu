import assert from "node:assert/strict";
import test from "node:test";

import type { DomainEvent, OutboxPort } from "#src/core/ports";
import { updatePost } from "../post";
import { InMemoryPostRepo } from "../repo.memory";

/**
 * @file T004 — failing-first certification of `updatePost`'s 4-row
 * status-transition table (ADR-PIPE-008 Decision §5, INV-010): at most one
 * `entry.published`/`entry.updated`/`entry.unpublished` outbox event per call,
 * exactly matching the transition that occurred. Certified BEFORE T010 wires
 * the real implementation and BEFORE any SEO-side subscription depends on it
 * (tasks.md Named Risk #1).
 */

class RecordingOutbox implements OutboxPort {
  enqueued: DomainEvent[] = [];
  async enqueue(event: DomainEvent): Promise<void> {
    this.enqueued.push(event);
  }
  async claimPending(): Promise<never[]> {
    return [];
  }
  async markDelivered(): Promise<void> {}
  async markFailed(): Promise<void> {}
}

const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };

function seedPost(overrides: Partial<Parameters<InMemoryPostRepo["save"]>[0]> = {}) {
  return {
    id: "post-1",
    workspaceId: "workspace-1",
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [] },
    status: "draft" as const,
    kind: "post" as const,
    updatedAt: "2026-07-12T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

test("updatePost transition table: not-published -> published emits exactly one entry.published event", async () => {
  const repo = new InMemoryPostRepo([seedPost({ status: "draft" })]);
  const outbox = new RecordingOutbox();

  await updatePost({
    deps: { repo, clock, outbox },
    input: {
      workspaceId: "workspace-1",
      id: "post-1",
      title: "Hello World",
      slug: "hello-world",
      bodyJson: { type: "doc", content: [] },
      status: "published",
    },
  });

  assert.equal(outbox.enqueued.length, 1);
  assert.equal(outbox.enqueued[0]!.name, "entry.published");
  assert.equal(outbox.enqueued[0]!.aggregateId, "post-1");
  assert.equal(outbox.enqueued[0]!.workspaceId, "workspace-1");
});

test("updatePost transition table: published -> published (edited) emits exactly one entry.updated event", async () => {
  const repo = new InMemoryPostRepo([seedPost({ status: "published" })]);
  const outbox = new RecordingOutbox();

  await updatePost({
    deps: { repo, clock, outbox },
    input: {
      workspaceId: "workspace-1",
      id: "post-1",
      title: "Hello World (edited)",
      slug: "hello-world",
      bodyJson: { type: "doc", content: [] },
      status: "published",
    },
  });

  assert.equal(outbox.enqueued.length, 1);
  assert.equal(outbox.enqueued[0]!.name, "entry.updated");
});

test("updatePost transition table: published -> not-published emits exactly one entry.unpublished event", async () => {
  const repo = new InMemoryPostRepo([seedPost({ status: "published" })]);
  const outbox = new RecordingOutbox();

  await updatePost({
    deps: { repo, clock, outbox },
    input: {
      workspaceId: "workspace-1",
      id: "post-1",
      title: "Hello World",
      slug: "hello-world",
      bodyJson: { type: "doc", content: [] },
      status: "draft",
    },
  });

  assert.equal(outbox.enqueued.length, 1);
  assert.equal(outbox.enqueued[0]!.name, "entry.unpublished");
});

test("updatePost transition table: not-published -> not-published (edited) emits no event", async () => {
  const repo = new InMemoryPostRepo([seedPost({ status: "draft" })]);
  const outbox = new RecordingOutbox();

  await updatePost({
    deps: { repo, clock, outbox },
    input: {
      workspaceId: "workspace-1",
      id: "post-1",
      title: "Hello World (still a draft)",
      slug: "hello-world",
      bodyJson: { type: "doc", content: [] },
      status: "draft",
    },
  });

  assert.equal(outbox.enqueued.length, 0);
});

test("updatePost transition table: the emitted event's payload carries entryId + contentType", async () => {
  const repo = new InMemoryPostRepo([seedPost({ status: "draft", kind: "page" })]);
  const outbox = new RecordingOutbox();

  await updatePost({
    deps: { repo, clock, outbox },
    input: {
      workspaceId: "workspace-1",
      id: "post-1",
      title: "A Page",
      slug: "hello-world",
      bodyJson: { type: "doc", content: [] },
      status: "published",
    },
  });

  assert.equal(outbox.enqueued.length, 1);
  const payload = outbox.enqueued[0]!.payload as { entryId: string; contentType: string };
  assert.equal(payload.entryId, "post-1");
  assert.equal(payload.contentType, "page");
});
