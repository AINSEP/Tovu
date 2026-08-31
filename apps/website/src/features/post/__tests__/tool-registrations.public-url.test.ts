import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";

/**
 * @file Regression coverage for the "assistant cannot find its own content's public URL" gap
 * (production transcript `sites/tovu-com/content.db`, `ai_chat_messages` rowid 427): the agent had
 * no way to learn the resolved public path of a post/page it had just read or created, and fell
 * back to grepping route source to guess the pattern. Certifies that `content_post_get`,
 * `content_post_list`, and `content_post_create` now carry a `publicUrl` field resolved through
 * `platform/routing`'s `urlFor` — the same inverse resolver SEO/Menus already treat as the single
 * source of truth for a post's live path — rather than a hand-rolled `/${slug}` string.
 */

const WORKSPACE_ID = "ws-public-url-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-08-30T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

function fakeRouteDeps() {
  const postRepo = new InMemoryPostRepo();
  const changeSets = new InMemoryChangeSetRepo();
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();

  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
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

async function seedPost(postRepo: InMemoryPostRepo, overrides: Record<string, unknown> = {}) {
  const row = {
    id: "p1",
    workspaceId: WORKSPACE_ID,
    title: "My Article",
    slug: "my-article",
    bodyJson: EMPTY_DOC,
    status: "published" as const,
    kind: "post" as const,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
  await postRepo.save(row as never);
  return row;
}

function registrationsFor(deps: PostToolDeps): Map<string, ToolRegistration> {
  return buildRegistrations(deps, createSurfaceExchangeStore());
}

test("content_post_get returns the resolved public path for a published post", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_get"), { id: "p1", kind: "post" })) as {
    post: { publicUrl: string | null };
  };

  assert.equal(result.post.publicUrl, "/my-article");
});

test("content_post_get returns publicUrl: null for a draft — never a link that would 404", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { status: "draft" });
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_get"), { id: "p1", kind: "post" })) as {
    post: { publicUrl: string | null };
  };

  assert.equal(result.post.publicUrl, null);
});

test("content_post_list returns publicUrl per row, null for drafts and set for published rows", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { id: "p1", slug: "my-article", status: "published" });
  await seedPost(postRepo, { id: "p2", slug: "unfinished", status: "draft" });
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_list"), { kind: "post" })) as {
    posts: Array<{ id: string; publicUrl: string | null }>;
  };

  const byId = new Map(result.posts.map((p) => [p.id, p.publicUrl]));
  assert.equal(byId.get("p1"), "/my-article");
  assert.equal(byId.get("p2"), null);
});

test("content_post_create returns publicUrl immediately when created as published", async () => {
  const { deps } = fakeRouteDeps();
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_create"), {
    kind: "post",
    title: "Brand New",
    slug: "brand-new",
    status: "published",
  })) as { post: { publicUrl: string | null } };

  assert.equal(result.post.publicUrl, "/brand-new");
});

test("content_post_create returns publicUrl: null for the default draft status", async () => {
  const { deps } = fakeRouteDeps();
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_create"), {
    kind: "post",
    title: "Still Drafting",
    slug: "still-drafting",
  })) as { post: { publicUrl: string | null } };

  assert.equal(result.post.publicUrl, null);
});
