import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { deriveContentReadRegistrations } from "#src/assistant/content-read-tool";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";
import { postAgentToolCatalog } from "../agent-tools.js";

function fixture() {
  const postRepo = new InMemoryPostRepo();
  let sequence = 0;
  const deps = {
    workspaceId: "ws-author-tools", clock: { nowMs: () => Date.parse("2026-10-09T00:00:00Z") },
    idGen: { newId: () => `author-id-${++sequence}` }, postRepo,
    changeSets: new InMemoryChangeSetRepo(), outbox: new InMemoryOutbox(), bus: new InMemoryEventBus(),
    authorize: async () => ({ allowed: true, reason: "matched" }),
    userRepo: { findByPrincipalId: async () => ({ username: "admin" }) },
  } as unknown as PostToolDeps;
  const registrations = deriveContentReadRegistrations(buildPostRegistrations(deps, {
    surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }),
  }));
  function call(id: string, input: unknown) {
    const registration: ToolRegistration | undefined = registrations.find(tool => tool.descriptor.id === id);
    assert.ok(registration, `missing tool ${id}`);
    return registration.handler({ executionId: "exec", principal: { id: "human" }, run: { id: "run" }, input,
      signal: new AbortController().signal } as ToolExecutionContext);
  }
  return { postRepo, call };
}

test("post tools default, edit, hide and clear author; content_read returns it by id, in lists and field projections", async () => {
  const { postRepo, call } = fixture();
  const created = await call("content_post_create", { kind: "post", title: "Credit" }) as { post: { id: string; author: string; showAuthor: boolean } };
  assert.equal(created.post.author, "admin");
  assert.equal(created.post.showAuthor, false);
  const target = { kind: "post", id: created.post.id };
  const edited = await call("content_post_update", { ...target, author: "Source Writer", showAuthor: true }) as { post: { author: string; showAuthor: boolean } };
  assert.deepEqual([edited.post.author, edited.post.showAuthor], ["Source Writer", true]);
  const fetched = await call("content_read.content_post", target) as { post: { author: string; showAuthor: boolean } };
  assert.deepEqual([fetched.post.author, fetched.post.showAuthor], ["Source Writer", true]);
  const listed = await call("content_read.content_post", { kind: "post", fields: ["author", "showAuthor"] }) as { posts: unknown[] };
  assert.deepEqual(listed.posts, [{ id: target.id, author: "Source Writer", showAuthor: true }]);
  await call("content_post_update", { ...target, showAuthor: false });
  let stored = await postRepo.findById({ workspaceId: "ws-author-tools", id: target.id });
  assert.deepEqual([stored?.author, stored?.showAuthor, stored?.createdByPrincipalId], ["Source Writer", false, "human"]);
  await call("content_post_update", { ...target, author: null });
  stored = await postRepo.findById({ workspaceId: "ws-author-tools", id: target.id });
  assert.deepEqual([stored?.author, stored?.showAuthor], [null, false]);
});

test("site import can explicitly suppress the importing account and retain a source byline", async () => {
  const { call } = fixture();
  const absent = await call("content_post_create", { kind: "post", title: "No byline", author: null, showAuthor: false }) as { post: { author: unknown; showAuthor: boolean } };
  assert.deepEqual([absent.post.author, absent.post.showAuthor], [null, false]);
  const imported = await call("content_post_create", { kind: "post", title: "Source article", author: "Jane Doe", showAuthor: true }) as { post: { author: string; showAuthor: boolean } };
  assert.deepEqual([imported.post.author, imported.post.showAuthor], ["Jane Doe", true]);
});

test("invalid byline input rejects rather than coercing a string toggle into permission to display", async () => {
  const { call, postRepo } = fixture();
  await assert.rejects(call("content_post_create", { kind: "post", title: "Bad", showAuthor: "false" }),
    (error: unknown) => error instanceof Error && error.message.startsWith("showAuthor must be a boolean"));
  assert.deepEqual(await postRepo.list({ workspaceId: "ws-author-tools" }), []);
});

test("create and update descriptors advertise the exact author and showAuthor input names", () => {
  for (const name of ["content_post_create", "content_post_update"]) {
    const definition = postAgentToolCatalog.find(tool => tool.name === name)!;
    assert.ok(definition.inputSchema);
    const properties = definition.inputSchema.properties as Record<string, { type: unknown }>;
    assert.deepEqual(properties.author.type, ["string", "null"]);
    assert.equal(properties.showAuthor.type, "boolean");
  }
});
