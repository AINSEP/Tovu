import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { buildContentDuplicationRegistrations } from "#src/features/content-duplication/tool-registrations";
import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, contributePostDuplicateHandlers, type PostToolDeps } from "../tool-registrations.js";

/**
 * @file Regression coverage for the "assistant cannot find its own content's admin edit URL" gap
 * (`ADS-memory/reports/2026-09-07-page-tool-gap.md` §3) — the SAME capability gap `publicUrl`
 * closed on 2026-08-30 (`tool-registrations.public-url.test.ts`), this time for "where do I go to
 * EDIT this" rather than "where does a visitor see it". Certifies that `content_post_get`,
 * `content_post_list`, `content_post_create`, and this domain's `content_duplicate` resource
 * handlers all carry an `adminUrl` field — unlike `publicUrl`, never `null`, since a draft is always
 * editable even though it is never publicly reachable.
 *
 * The last case reaches the copy through the cross-resource `content_duplicate` tool rather than the
 * retired bespoke `content_post_duplicate`; it asserts exactly what it asserted before.
 */

const WORKSPACE_ID = "ws-admin-url-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-07T00:00:00.000Z";
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
    bodyFormat: "doc" as const,
    bodyHtml: null,
    status: "draft" as const,
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

test("content_post_get returns adminUrl '/admin/posts/{id}' for a post", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { kind: "post" });
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_get"), { id: "p1", kind: "post" })) as { post: { adminUrl: string } };
  assert.equal(result.post.adminUrl, "/admin/posts/p1");
});

test("content_post_get returns adminUrl '/admin/pages/{slug}' for a page, preferring slug over id", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { id: "page-1", slug: "about", kind: "page" });
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_get"), { id: "page-1", kind: "page" })) as { post: { adminUrl: string } };
  assert.equal(result.post.adminUrl, "/admin/pages/about");
});

test("content_post_get returns adminUrl '/admin/pages/{id}' for a page claiming the literal root slug '/' — a slug cannot be a path segment", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { id: "home-page", slug: "/", kind: "page" });
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_get"), { id: "home-page", kind: "page" })) as { post: { adminUrl: string } };
  assert.equal(result.post.adminUrl, "/admin/pages/home-page");
});

test("adminUrl is present for a DRAFT — unlike publicUrl, it is never null (a draft is always editable)", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { status: "draft" });
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_get"), { id: "p1", kind: "post" })) as {
    post: { adminUrl: string; publicUrl: string | null };
  };
  assert.equal(result.post.publicUrl, null);
  assert.equal(result.post.adminUrl, "/admin/posts/p1");
});

test("content_post_list returns adminUrl per row", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { id: "p1", kind: "post" });
  await seedPost(postRepo, { id: "p2", kind: "post" });
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_list"), { kind: "post" })) as {
    posts: Array<{ id: string; adminUrl: string }>;
  };

  const byId = new Map(result.posts.map((p) => [p.id, p.adminUrl]));
  assert.equal(byId.get("p1"), "/admin/posts/p1");
  assert.equal(byId.get("p2"), "/admin/posts/p2");
});

test("content_post_create returns adminUrl for the newly created row", async () => {
  const { deps } = fakeRouteDeps();
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_create"), {
    kind: "post",
    title: "Brand New",
    slug: "brand-new",
  })) as { post: { id: string; adminUrl: string } };

  assert.equal(result.post.adminUrl, `/admin/posts/${result.post.id}`);
});

test("content_duplicate's 'page' resource returns adminUrl for the newly created copy, distinct from the source's own adminUrl", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { id: "source-1", slug: "original", kind: "page" });
  const registrations = new Map(
    buildContentDuplicationRegistrations(deps as unknown as AssistantToolRegistryDeps, {
      listResourceHandlers: contributePostDuplicateHandlers,
    }).map((r) => [r.descriptor.id, r]),
  );

  const result = (await call(tool(registrations, "content_duplicate"), { resource: "page", id: "source-1" })) as {
    post: { adminUrl: string };
  };

  assert.notEqual(result.post.adminUrl, "/admin/pages/original");
  assert.match(result.post.adminUrl, /^\/admin\/pages\//);
});
