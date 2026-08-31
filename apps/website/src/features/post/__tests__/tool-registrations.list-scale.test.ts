import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo } from "../repo.memory.js";
import { DEFAULT_POST_LIST_LIMIT, MAX_POST_LIST_LIMIT } from "../post.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";

/**
 * @file Regression coverage for H3: `content_post_list` was an unbounded N+1 — resolving each row's
 * `publicUrl` went through `urlFor`, which re-fetches the exact `PostRecord` already sitting in the
 * loop variable via `postRepo.findById`, so the query count scaled with the row count instead of
 * staying flat. Certifies the fix resolves `publicUrl` from the record the list already holds
 * (`platform/routing`'s `entryPublicPath`) with zero additional `postRepo.findById` calls.
 *
 * Also certifies the second H3 defect: `content_post_list` had no `limit` at all, so it returned
 * every row in the workspace. Certifies the tool now caps output at `DEFAULT_POST_LIST_LIMIT`
 * (raisable up to `MAX_POST_LIST_LIMIT` via the `limit` input), and — because a silently-truncating
 * list would leave the model with no way to tell it was truncated (and no aggregate/count tool to
 * fall back on) — that truncation is always visible via `total`/`hasMore`.
 */

const WORKSPACE_ID = "ws-list-scale";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-08-30T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

function fakeRouteDeps() {
  const postRepo = new InMemoryPostRepo();
  const changeSets = new InMemoryChangeSetRepo();
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${Math.random()}` },
    changeSets,
    outbox,
    bus,
    postRepo,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as PostToolDeps;

  return { deps, postRepo };
}

function buildRegistrations(deps: PostToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildPostRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

/** Checked registry lookup — `registrations.get(id)!` would trip the repo's noNonNullAssertion rule. */
function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

function call(registration: ToolRegistration, input: unknown) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
  return registration.handler(ctx);
}

function registrationsFor(deps: PostToolDeps): Map<string, ToolRegistration> {
  return buildRegistrations(deps, createSurfaceExchangeStore());
}

async function seedPublishedPosts(postRepo: InMemoryPostRepo, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await postRepo.save({
      id: `p${i}`,
      workspaceId: WORKSPACE_ID,
      title: `Post ${i}`,
      slug: `post-${i}`,
      bodyJson: EMPTY_DOC,
      status: "published",
      kind: "post",
      updatedAt: NOW,
      version: 1,
    } as never);
  }
}

/** Wraps `postRepo.findById` with a call counter, in place, so the handler under test observes no
 *  behavior change — only the tool-registrations layer's own hidden repo traffic is measured. */
function spyOnFindById(postRepo: InMemoryPostRepo): () => number {
  const original = postRepo.findById.bind(postRepo);
  let calls = 0;
  postRepo.findById = (async (...args: Parameters<typeof original>) => {
    calls++;
    return original(...args);
  }) as typeof postRepo.findById;
  return () => calls;
}

test("content_post_list resolves publicUrl for every row with zero additional postRepo.findById calls (no N+1)", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPublishedPosts(postRepo, 20);
  const findByIdCallCount = spyOnFindById(postRepo);
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_list"), { kind: "post" })) as {
    posts: Array<{ id: string; publicUrl: string | null }>;
  };

  assert.equal(result.posts.length, 20);
  assert.ok(
    result.posts.every((p) => typeof p.publicUrl === "string" && p.publicUrl.startsWith("/post-")),
    "expected every row to still resolve its own publicUrl correctly"
  );
  assert.equal(
    findByIdCallCount(),
    0,
    `expected 0 postRepo.findById calls while resolving publicUrl for 20 already-held rows, got ${findByIdCallCount()} ` +
      "(publicUrl resolution must not re-query a row the list already holds)"
  );
});

test("content_post_list caps output at DEFAULT_POST_LIST_LIMIT and signals truncation via total/hasMore", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  const seeded = DEFAULT_POST_LIST_LIMIT + 15;
  await seedPublishedPosts(postRepo, seeded);
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_list"), { kind: "post" })) as {
    posts: unknown[];
    total: number;
    hasMore: boolean;
  };

  assert.equal(result.posts.length, DEFAULT_POST_LIST_LIMIT, "expected output truncated to the default limit");
  assert.equal(result.total, seeded, "expected 'total' to report the full un-truncated row count");
  assert.equal(result.hasMore, true, "expected 'hasMore' to signal truncation happened");
});

test("content_post_list reports hasMore:false and total === row count when under the default limit", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPublishedPosts(postRepo, 3);
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_list"), { kind: "post" })) as {
    posts: unknown[];
    total: number;
    hasMore: boolean;
  };

  assert.equal(result.posts.length, 3);
  assert.equal(result.total, 3);
  assert.equal(result.hasMore, false);
});

test("content_post_list honors an explicit limit input, clamped up to MAX_POST_LIST_LIMIT", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPublishedPosts(postRepo, MAX_POST_LIST_LIMIT + 10);
  const registrations = registrationsFor(deps);

  const requestedFive = (await call(tool(registrations, "content_post_list"), { kind: "post", limit: 5 })) as {
    posts: unknown[];
    total: number;
    hasMore: boolean;
  };
  assert.equal(requestedFive.posts.length, 5);
  assert.equal(requestedFive.hasMore, true);

  const requestedOverMax = (await call(tool(registrations, "content_post_list"), {
    kind: "post",
    limit: MAX_POST_LIST_LIMIT + 1000,
  })) as { posts: unknown[]; total: number; hasMore: boolean };
  assert.equal(requestedOverMax.posts.length, MAX_POST_LIST_LIMIT, "expected an over-max limit clamped down rather than rejected");
});
