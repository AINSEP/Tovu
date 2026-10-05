import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryMediaContentTypeStore, InMemoryMediaRepo, type MediaRecord } from "../../media/index.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";
import { postAgentToolCatalog } from "../agent-tools.js";

/**
 * @file Scheduled publishing + featured image through the chat tools (2026-10-05):
 * `content_post_create`/`content_post_update` accept `publishAt` and `featuredImage`, and the tool
 * view tells the model when a post goes live.
 */

const WORKSPACE_ID = "ws-post-schedule-tools";
const NOW = "2026-10-05T00:00:00.000Z";
const FUTURE = "2099-01-01T09:00:00-07:00";
const FUTURE_UTC = "2099-01-01T16:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

function mediaRecord(overrides: Partial<MediaRecord>): MediaRecord {
  return {
    id: "m-img",
    workspaceId: WORKSPACE_ID,
    title: "Hero",
    slug: "hero",
    alt: "",
    caption: "",
    credit: "",
    source: { sha256: "sha-img" },
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    ...overrides,
  } as MediaRecord;
}

async function fakeRouteDeps(options: { withMedia?: boolean } = {}) {
  const postRepo = new InMemoryPostRepo();
  const mediaRepo = new InMemoryMediaRepo({});
  const contentTypes = new InMemoryMediaContentTypeStore();
  await mediaRepo.save(mediaRecord({}));
  await mediaRepo.save(mediaRecord({ id: "m-vid", slug: "clip", source: { sha256: "sha-vid" } }));
  await mediaRepo.save(mediaRecord({ id: "m-trash", slug: "old", status: "trashed", source: { sha256: "sha-old" } }));
  await contentTypes.set({ workspaceId: WORKSPACE_ID, sha256: "sha-img", contentType: "image/png" });
  await contentTypes.set({ workspaceId: WORKSPACE_ID, sha256: "sha-vid", contentType: "video/mp4" });
  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `id-${++counter}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    postRepo,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    ...(options.withMedia === false ? {} : { mediaRepo, mediaContentTypeStore: contentTypes }),
  } as unknown as PostToolDeps;
  return { deps, postRepo };
}

function tool(deps: PostToolDeps, id: string): ToolRegistration {
  const found = buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() }).find((r) => r.descriptor.id === id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

function call(registration: ToolRegistration, input: unknown) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: "principal-under-test" },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
  return registration.handler(ctx);
}

type ToolPost = { id: string; status: string; publicUrl: string | null; publishAt?: string; featuredMediaId?: string; scheduled?: true };

async function seedPost(postRepo: InMemoryPostRepo, overrides: Record<string, unknown> = {}) {
  await postRepo.save({
    id: "p1", workspaceId: WORKSPACE_ID, title: "T", slug: "t", bodyJson: EMPTY_DOC, status: "draft", kind: "post", updatedAt: NOW, version: 1,
    ...overrides,
  } as never);
}

test("content_post_create: publishAt + published schedules the post — scheduled:true, UTC publishAt, no publicUrl yet", async () => {
  const { deps, postRepo } = await fakeRouteDeps();
  const { post } = (await call(tool(deps, "content_post_create"), { kind: "post", title: "Launch", status: "published", publishAt: FUTURE })) as { post: ToolPost };
  assert.equal(post.scheduled, true);
  assert.equal(post.publishAt, FUTURE_UTC);
  assert.equal(post.publicUrl, null);
  const stored = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: post.id });
  assert.equal(stored?.publishAt, FUTURE_UTC);
});

test("content_post_create: featuredImage by SLUG stores the asset's id", async () => {
  const { deps, postRepo } = await fakeRouteDeps();
  const { post } = (await call(tool(deps, "content_post_create"), { kind: "post", title: "With image", featuredImage: "hero" })) as { post: ToolPost };
  assert.equal(post.featuredMediaId, "m-img");
  const stored = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: post.id });
  assert.equal(stored?.featuredMediaId, "m-img");
});

test("content_post_create: a row with neither field keeps the old view shape (no schedule keys)", async () => {
  const { deps } = await fakeRouteDeps();
  const { post } = (await call(tool(deps, "content_post_create"), { kind: "post", title: "Plain" })) as { post: Record<string, unknown> };
  assert.equal("publishAt" in post, false);
  assert.equal("featuredMediaId" in post, false);
  assert.equal("scheduled" in post, false);
});

test("content_post_create: an offset-less publishAt is rejected and nothing is written", async () => {
  const { deps, postRepo } = await fakeRouteDeps();
  await assert.rejects(
    () => call(tool(deps, "content_post_create"), { kind: "post", title: "Bad", publishAt: "2099-01-01T09:00:00" }),
    (err: unknown) => err instanceof Error && err.message.includes("publishAt must be an ISO 8601 date-time with a timezone offset")
  );
  assert.equal((await postRepo.list({ workspaceId: WORKSPACE_ID })).length, 0);
});

for (const [ref, expected] of [
  ["nope", "featuredImage: no media asset has the id or slug 'nope'. Find one with content_read.media_asset, or upload one first."],
  ["old", "featuredImage: media asset 'old' is in Trash. Restore it first, or pick another image."],
  ["clip", "featuredImage: media asset 'clip' is video/mp4, not an image. A featured image must be an image."],
] as const) {
  test(`content_post_update: featuredImage '${ref}' is refused with the exact reason, nothing written`, async () => {
    const { deps, postRepo } = await fakeRouteDeps();
    await seedPost(postRepo);
    await assert.rejects(() => call(tool(deps, "content_post_update"), { id: "p1", kind: "post", featuredImage: ref }), (err: unknown) => err instanceof Error && err.message === expected);
    const after = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
    assert.equal(after?.version, 1);
    assert.equal(after?.featuredMediaId, undefined);
  });
}

test("content_post_update: featuredImage is refused when the session has no media library deps", async () => {
  const { deps, postRepo } = await fakeRouteDeps({ withMedia: false });
  await seedPost(postRepo);
  await assert.rejects(
    () => call(tool(deps, "content_post_update"), { id: "p1", kind: "post", featuredImage: "hero" }),
    (err: unknown) => err instanceof Error && err.message.startsWith("featuredImage: the media library is not available")
  );
});

test("content_post_update: publishAt alone is a valid patch; other fields keep their stored values", async () => {
  const { deps, postRepo } = await fakeRouteDeps();
  await seedPost(postRepo, { status: "published" });
  const { post } = (await call(tool(deps, "content_post_update"), { id: "p1", kind: "post", publishAt: FUTURE })) as { post: ToolPost };
  assert.equal(post.scheduled, true);
  assert.equal(post.publicUrl, null);
  const after = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(after?.publishAt, FUTURE_UTC);
  assert.equal(after?.title, "T");
  assert.equal(after?.status, "published");
});

test("content_post_update: publishAt:null and featuredImage:null clear both; the post is live again", async () => {
  const { deps, postRepo } = await fakeRouteDeps();
  await seedPost(postRepo, { status: "published", publishAt: FUTURE_UTC, featuredMediaId: "m-img" });
  const { post } = (await call(tool(deps, "content_post_update"), { id: "p1", kind: "post", publishAt: null, featuredImage: null })) as { post: ToolPost };
  assert.equal("scheduled" in post, false);
  assert.equal(post.publicUrl, "/t");
  const after = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(after?.publishAt, undefined);
  assert.equal(after?.featuredMediaId, undefined);
});

test("content_post_update: omitting both keeps a stored schedule and image", async () => {
  const { deps, postRepo } = await fakeRouteDeps();
  await seedPost(postRepo, { status: "published", publishAt: FUTURE_UTC, featuredMediaId: "m-img" });
  await call(tool(deps, "content_post_update"), { id: "p1", kind: "post", title: "Renamed" });
  const after = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(after?.publishAt, FUTURE_UTC);
  assert.equal(after?.featuredMediaId, "m-img");
});

test("content_post_list: rows carry scheduled/publishAt only when set", async () => {
  const { deps, postRepo } = await fakeRouteDeps();
  await seedPost(postRepo, { status: "published", publishAt: FUTURE_UTC });
  await seedPost(postRepo, { id: "p2", slug: "t2" });
  const { posts } = (await call(tool(deps, "content_post_list"), { kind: "post" })) as { posts: Array<Record<string, unknown>> };
  const byId = new Map(posts.map((p) => [p.id, p]));
  assert.equal(byId.get("p1")?.scheduled, true);
  assert.equal(byId.get("p1")?.publishAt, FUTURE_UTC);
  assert.equal("scheduled" in (byId.get("p2") ?? {}), false);
});

test("catalog: create/update schemas publish publishAt + featuredImage, and their descriptions name both", () => {
  for (const name of ["content_post_create", "content_post_update"]) {
    const entry = postAgentToolCatalog.find((t) => t.name === name);
    const properties = (entry?.inputSchema as { properties: Record<string, unknown> }).properties;
    assert.ok(properties.publishAt, `${name} publishAt`);
    assert.ok(properties.featuredImage, `${name} featuredImage`);
    assert.match(entry?.description ?? "", /publishAt/);
    assert.match(entry?.description ?? "", /featuredImage/);
  }
});
