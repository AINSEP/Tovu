/**
 * @file Pins post tool branches the scenario suites do not reach: content_post_update's target
 * guards and unit-of-work rollback (a missing row or page-kind mismatch is not-found before any
 * write, an unavailable template is refused, a failed change-set record restores forward), the
 * create rollback, search option forwarding, the get kind guard and the hard excerpt cut.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import type { PostSearchQuery } from "../search.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, contributePostTools, type PostToolDeps } from "../tool-registrations.js";
import { buildPostRecord } from "./post-record.fixture.js";

const WS = "workspace-1";

/** Refuses every change-set record, so the gateway must roll the feature write back. */
class RefusingChangeSetRepo extends InMemoryChangeSetRepo {
  override async insert(): Promise<void> {
    throw new Error("change-set store unavailable");
  }
}

function harness(
  changeSets: InMemoryChangeSetRepo = new InMemoryChangeSetRepo(),
  optional: { postRepo?: InMemoryPostRepo; pluginBeforeSaveHook?: PostToolDeps["pluginBeforeSaveHook"] } = {},
) {
  const postRepo = optional.postRepo ?? new InMemoryPostRepo([buildPostRecord({ status: "draft" })]);
  const searches: PostSearchQuery[] = [];
  let counter = 0;
  const deps: PostToolDeps = {
    workspaceId: WS,
    authorize: async () => ({ allowed: true, reason: "fixture grant" }),
    clock: { nowMs: () => Date.parse("2026-10-20T12:00:00.000Z") },
    idGen: { newId: () => `id-${++counter}` },
    changeSets,
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    postRepo,
    postSearch: { search: async (query) => { searches.push(query); return []; } },
    pluginBeforeSaveHook: optional.pluginBeforeSaveHook ?? (async () => ({})),
    slugChangeCapture: () => undefined,
    removePost: async () => ({ ok: false, reason: "not-found" }),
    forgetRemovedPost: async () => {},
  };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const registrations = buildPostRegistrations(deps, { surfaceExchanges });
  const tool = (id: string): ToolRegistration => {
    const found = registrations.find((registration) => registration.descriptor.id === id);
    assert.ok(found, `${id} is registered`);
    return found;
  };
  return { changeSets, postRepo, searches, tool, update: tool("content_post_update") };
}

function call(registration: ToolRegistration, input: unknown) {
  const ctx: ToolExecutionContext = { executionId: "e", principal: { id: "agent" }, run: { id: "r" }, input, signal: new AbortController().signal };
  return registration.handler(ctx);
}

test("content_post_update: an unknown id is not-found", async () => {
  const { update } = harness();
  await assert.rejects(call(update, { id: "ghost", kind: "post", title: "New" }), { message: "CONTENT_POST_NOT_FOUND: post 'ghost' was not found" });
});

test("content_post_update: kind page on a post row is not-found and writes nothing", async () => {
  const { postRepo, update } = harness();
  await assert.rejects(call(update, { id: "post-1", kind: "page", title: "New" }), { message: "CONTENT_POST_NOT_FOUND: page 'post-1' was not found" });
  assert.equal((await postRepo.findById({ workspaceId: WS, id: "post-1" }))?.version, 1);
});

test("content_post_update: a template the active theme does not offer is refused with the valid list", async () => {
  const { update } = harness();
  await assert.rejects(call(update, { id: "post-1", kind: "post", template: "missing.html" }), {
    message: "content_post_update: template 'missing.html' is not available for this post in the active theme. Valid templates: []. Use one of these filenames, an empty string for no template, or null to reset the choice. Nothing was changed.",
  });
});

test("content_post_update: a failed change-set record restores the prior post forward", async () => {
  const { postRepo, update } = harness(new RefusingChangeSetRepo());
  await assert.rejects(call(update, { id: "post-1", kind: "post", title: "Changed" }), { message: "change-set store unavailable" });
  const restored = await postRepo.findById({ workspaceId: WS, id: "post-1" });
  assert.deepEqual({ title: restored?.title, version: restored?.version }, { title: "Hello World", version: 3 });
  const ops = (await postRepo.listRevisions({ workspaceId: WS, postId: "post-1" })).map((revision) => [revision.op, revision.actorId]);
  assert.deepEqual(ops, [["update", "agent"], ["restore", "agent"]]);
});

test("content_post_create: a failed change-set record leaves no created row behind", async () => {
  const { postRepo, tool } = harness(new RefusingChangeSetRepo());
  await assert.rejects(call(tool("content_post_create"), { kind: "post", title: "Fresh", bodyJson: { type: "doc", content: [] } }), { message: "change-set store unavailable" });
  const rows = await postRepo.list({ workspaceId: WS });
  assert.deepEqual(rows.map((row) => row.id), ["post-1"]);
});

test("content_post_create: a blank featuredImage is refused before any write", async () => {
  const { postRepo, tool } = harness();
  await assert.rejects(call(tool("content_post_create"), { kind: "post", title: "Fresh", featuredImage: "  " }), { message: "featuredImage must be a media asset id or slug, or null to remove the featured image." });
  assert.equal((await postRepo.list({ workspaceId: WS })).length, 1);
});

test("content_post_search: kind, status and limit are forwarded to the search port", async () => {
  const { searches, tool } = harness();
  await call(tool("content_post_search"), { query: "hello", kind: "page", status: "published", limit: 3 });
  assert.deepEqual(searches.map(({ kind, status, limit }) => ({ kind, status, limit })), [{ kind: "page", status: "published", limit: 3 }]);
});

test("content_post_search: a missing query is a shape refusal", async () => {
  const { searches, tool } = harness();
  await assert.rejects(call(tool("content_post_search"), {}), { message: "'query' (non-empty string) is required" });
  assert.deepEqual(searches, []);
});

test("content_post_get: kind page on a post row is not-found", async () => {
  const { tool } = harness();
  await assert.rejects(call(tool("content_post_get"), { id: "post-1", kind: "page" }), { message: "CONTENT_POST_NOT_FOUND: page 'post-1' was not found" });
});

test("contributePostTools installs the post builder under the post domain", () => {
  const contributor = contributePostTools();
  assert.equal(contributor.domain, "post");
  assert.equal(contributor.build, buildPostRegistrations);
});

test("content_post_update: a featuredImage-only patch is accepted, not refused as empty", async () => {
  const { update } = harness();
  const result = await call(update, { id: "post-1", kind: "post", featuredImage: null }) as { post: { id: string } };
  assert.equal(result.post.id, "post-1");
});

test("content_post_update: a patch omitting only the title is pinned to the row it read", async () => {
  const postRepo = new InMemoryPostRepo([buildPostRecord({ status: "draft" })]);
  const pluginBeforeSaveHook = async () => {
    const row = await postRepo.findById({ workspaceId: WS, id: "post-1" });
    if (row) await postRepo.save({ ...row, version: row.version + 1 });
    return {};
  };
  const { update } = harness(new InMemoryChangeSetRepo(), { postRepo, pluginBeforeSaveHook });
  await assert.rejects(
    call(update, { id: "post-1", kind: "post", slug: "hello-world", bodyJson: { type: "doc", content: [] }, status: "published" }),
    (error: unknown) => error instanceof Error && error.message.startsWith("VERSION_CONFLICT: post 'post-1' was modified by another save (expected version 1, current version 2)."),
  );
});

test("content_post_update: the recorded inverse carries the stored schedule and byline, and templateChoice only when sent", async () => {
  const postRepo = new InMemoryPostRepo([buildPostRecord({ status: "draft", publishAt: "2027-01-01T00:00:00.000Z", author: "Ada", showAuthor: true, templateChoice: "wide.html" })]);
  const { changeSets, update } = harness(new InMemoryChangeSetRepo(), { postRepo });
  const inverses = async () => Promise.all((await changeSets.listByWorkspace({ workspaceId: WS })).map(async (record) => (await changeSets.findById({ workspaceId: WS, id: record.id }))?.items[0]?.inversePayload));
  await call(update, { id: "post-1", kind: "post", title: "Renamed" });
  const base = { title: "Hello World", slug: "hello-world", bodyJson: { type: "doc", content: [] }, status: "draft", publishAt: "2027-01-01T00:00:00.000Z", featuredMediaId: null, author: "Ada", showAuthor: true };
  assert.deepEqual(await inverses(), [base]);
  await call(update, { id: "post-1", kind: "post", template: "" });
  assert.deepEqual((await inverses()).find((inverse) => inverse?.title === "Renamed"), { ...base, title: "Renamed", templateChoice: "wide.html" });
});

test("content_post_search: omitted kind, status and limit are left for the search defaults", async () => {
  const { searches, tool } = harness();
  await call(tool("content_post_search"), { query: "hello" });
  assert.deepEqual(searches.map((query) => ["kind", "status"].filter((key) => key in query)), [[]]);
});
