import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, PUBLISHED_WHERE_LIVE, PUBLISHED_WHERE_LOCAL, type PostToolDeps } from "../tool-registrations.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file Demo dry run 2026-10-05: after creating a page with status "published" on the LOCAL site,
 * the assistant replied "Your page is live". Nothing in the write result said where the publish
 * happened, so `status: "published"` + `publicUrl` read as "on the live site". The write results
 * now carry `publishedWhere`, which says local-only (and how to send it live) unless this instance
 * IS the live site.
 */

const NOW = "2026-10-05T00:00:00.000Z";

function deps(runtimeMode: "local" | "production") {
  let counter = 0;
  const postRepo = new InMemoryPostRepo();
  return {
    postRepo,
    deps: {
      workspaceId: "ws-published-where",
      clock: { nowMs: () => Date.parse(NOW) },
      idGen: { newId: () => `id-${++counter}` },
      changeSets: new InMemoryChangeSetRepo(),
      outbox: new InMemoryOutbox(),
      bus: new InMemoryEventBus(),
      postRepo,
      authorize: async () => ({ allowed: true, reason: "matched" }),
      runtimeMode: () => runtimeMode,
    } as unknown as PostToolDeps,
  };
}

function call(d: PostToolDeps, id: string, input: unknown) {
  const registration = buildPostRegistrations(d, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) }).find((r: ToolRegistration) => r.descriptor.id === id);
  assert.ok(registration, `expected '${id}' to be wired`);
  const ctx: ToolExecutionContext = { executionId: "exec-1", principal: { id: "p" }, run: { id: "run-1" }, input, signal: new AbortController().signal };
  return registration.handler(ctx) as Promise<{ post: Record<string, unknown> }>;
}

test("content_post_create published on a local site says local-only, not live", async () => {
  const { deps: d } = deps("local");
  const { post } = await call(d, "content_post_create", { kind: "page", title: "Get in touch", slug: "get-in-touch", status: "published" });
  assert.equal(post.publishedWhere, PUBLISHED_WHERE_LOCAL);
  assert.match(PUBLISHED_WHERE_LOCAL, /not on the live site/i);
  assert.match(PUBLISHED_WHERE_LOCAL, /publish_content_publish/);
});

test("content_post_create published on the live instance says live", async () => {
  const { deps: d } = deps("production");
  const { post } = await call(d, "content_post_create", { kind: "post", title: "Hello", status: "published" });
  assert.equal(post.publishedWhere, PUBLISHED_WHERE_LIVE);
});

test("a draft carries no publishedWhere", async () => {
  const { deps: d } = deps("local");
  const { post } = await call(d, "content_post_create", { kind: "post", title: "Draft only" });
  assert.equal("publishedWhere" in post, false);
});

test("content_post_update publishing a draft on a local site says local-only", async () => {
  const { deps: d } = deps("local");
  const { post: created } = await call(d, "content_post_create", { kind: "post", title: "Later" });
  const { post } = await call(d, "content_post_update", { id: created.id, kind: "post", status: "published", expectedVersion: created.version });
  assert.equal(post.status, "published");
  assert.equal(post.publishedWhere, PUBLISHED_WHERE_LOCAL);
});
