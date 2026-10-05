import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import type { SlugChangeCapture, SlugChangeCaptureInput } from "#src/platform/routing/index";
import { PostValidationError, ROOT_SLUG, SYSTEM_ACTOR_ID, updatePost, type PostRecord, type UpdatePostDeps } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";

/**
 * @file `updatePost`'s two slug rules the create path already had and the update path lacked:
 *
 * 1. SPEC-009 REQ-15 — a published entry whose slug changes calls the bound `SlugChangeCapture`
 *    inside the same transaction as the write, so its old URL keeps resolving (301) instead of
 *    404ing. SPEC-009 shipped the capture and its registration slot but explicitly deferred this
 *    call ("Known accepted gap", 6df050720); nothing ever made it.
 * 2. SPEC-002 REQ-04 — a caller may not rename an entry onto a reserved slug (`admin`, `api`); the
 *    update path only checked the slug's format, so create refused `admin` and update accepted it.
 */

const WORKSPACE_ID = "workspace-1";
const NOW = "2026-10-05T00:00:00.000Z";
const clock = { nowMs: () => Date.parse(NOW) };

const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

function seed(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE_ID,
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: "2026-04-06T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

/** A recording capture; `fail` makes it throw the way a failed redirect insert would. */
function recordingCapture(options: { fail?: Error } = {}): SlugChangeCapture & { calls: SlugChangeCaptureInput[] } {
  const calls: SlugChangeCaptureInput[] = [];
  return {
    calls,
    async onSlugChange(input) {
      calls.push(input);
      if (options.fail) throw options.fail;
    },
  };
}

function deps(repo: InMemoryPostRepo, capture: SlugChangeCapture | undefined): UpdatePostDeps {
  return { repo, clock, outbox: noopOutbox, slugChangeCapture: () => capture };
}

function rename(record: PostRecord, slug: string, extra: { status?: "draft" | "published"; actorId?: string } = {}) {
  return {
    workspaceId: WORKSPACE_ID,
    id: record.id,
    title: record.title,
    slug,
    bodyJson: record.bodyJson,
    status: extra.status ?? record.status,
    ...(extra.actorId !== undefined ? { actorId: extra.actorId } : {}),
  };
}

test("a published entry's slug change hands the capture its old and new public paths", async () => {
  const record = seed();
  const repo = new InMemoryPostRepo([record]);
  const capture = recordingCapture();

  await updatePost({ deps: deps(repo, capture), input: rename(record, "renamed", { actorId: "principal-7" }) });

  assert.deepEqual(capture.calls, [
    { workspaceId: WORKSPACE_ID, entryId: "post-1", oldPath: "/hello-world", newPath: "/renamed", actor: "principal-7" },
  ]);
});

test("an unattributed slug change is captured as the system actor", async () => {
  const record = seed();
  const capture = recordingCapture();

  await updatePost({ deps: deps(new InMemoryPostRepo([record]), capture), input: rename(record, "renamed") });

  assert.equal(capture.calls[0]?.actor, SYSTEM_ACTOR_ID);
});

test("a published entry moving ONTO the root slug is captured with '/' as its new path", async () => {
  const record = seed({ kind: "page" });
  const capture = recordingCapture();

  await updatePost({ deps: deps(new InMemoryPostRepo([record]), capture), input: rename(record, ROOT_SLUG) });

  assert.deepEqual(capture.calls.map(({ oldPath, newPath }) => ({ oldPath, newPath })), [{ oldPath: "/hello-world", newPath: "/" }]);
});

test("a draft's slug change captures nothing: its old URL was never public", async () => {
  const record = seed({ status: "draft" });
  const capture = recordingCapture();

  await updatePost({ deps: deps(new InMemoryPostRepo([record]), capture), input: rename(record, "renamed") });

  assert.deepEqual(capture.calls, []);
});

test("publishing a draft under a new slug captures nothing: the old URL was a draft's", async () => {
  const record = seed({ status: "draft" });
  const capture = recordingCapture();

  await updatePost({ deps: deps(new InMemoryPostRepo([record]), capture), input: rename(record, "renamed", { status: "published" }) });

  assert.deepEqual(capture.calls, []);
});

test("unpublishing under a new slug still captures: the old URL was public until this write", async () => {
  const record = seed();
  const capture = recordingCapture();

  await updatePost({ deps: deps(new InMemoryPostRepo([record]), capture), input: rename(record, "renamed", { status: "draft" }) });

  assert.equal(capture.calls.length, 1);
});

test("a published save that keeps its slug captures nothing", async () => {
  const record = seed();
  const capture = recordingCapture();

  await updatePost({ deps: deps(new InMemoryPostRepo([record]), capture), input: { ...rename(record, record.slug), title: "New title" } });

  assert.deepEqual(capture.calls, []);
});

test("the homepage page leaving the root slug captures nothing: '/' must not redirect away", async () => {
  const record = seed({ kind: "page", slug: ROOT_SLUG });
  const capture = recordingCapture();

  await updatePost({ deps: deps(new InMemoryPostRepo([record]), capture), input: rename(record, "about") });

  assert.deepEqual(capture.calls, []);
});

test("no bound capture (lookup returns undefined) still saves the rename", async () => {
  const record = seed();
  const repo = new InMemoryPostRepo([record]);

  const { post } = await updatePost({ deps: deps(repo, undefined), input: rename(record, "renamed") });

  assert.equal(post.slug, "renamed");
  assert.equal((await repo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" }))?.slug, "renamed");
});

test("no lookup injected at all (a caller predating the slot) still saves the rename", async () => {
  const record = seed();
  const repo = new InMemoryPostRepo([record]);

  const { post } = await updatePost({ deps: { repo, clock, outbox: noopOutbox }, input: rename(record, "renamed") });

  assert.equal(post.slug, "renamed");
});

test("a capture that throws rolls the rename back: no moved entry without its redirect (INV-02)", async () => {
  const record = seed();
  const repo = new InMemoryPostRepo([record]);
  const capture = recordingCapture({ fail: new Error("redirect insert failed") });

  await assert.rejects(() => updatePost({ deps: deps(repo, capture), input: rename(record, "renamed") }), /redirect insert failed/);

  const stored = await repo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" });
  assert.deepEqual({ slug: stored?.slug, version: stored?.version }, { slug: "hello-world", version: 1 });
  assert.deepEqual(await repo.listRevisions({ workspaceId: WORKSPACE_ID, postId: "post-1" }), []);
});

for (const reserved of ["admin", "api"]) {
  test(`updatePost refuses a rename onto the reserved slug '${reserved}' with create's message, writing nothing`, async () => {
    const record = seed();
    const repo = new InMemoryPostRepo([record]);
    const capture = recordingCapture();

    await assert.rejects(
      () => updatePost({ deps: deps(repo, capture), input: rename(record, reserved) }),
      (err: unknown) => {
        assert.ok(err instanceof PostValidationError);
        assert.equal((err as Error).message, `slug '${reserved}' is reserved`);
        return true;
      }
    );

    assert.equal((await repo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" }))?.slug, "hello-world");
    assert.deepEqual(capture.calls, []);
  });
}
