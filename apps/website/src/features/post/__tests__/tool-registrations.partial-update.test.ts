import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { createPost } from "../post.js";
import type { PostRepoPort } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";
import { InMemoryPagesHtmlDocumentStore } from "../../pages/html-document-store.memory.js";
import { DEFAULT_PAGE_SKELETON } from "../../pages/skeleton.js";

/**
 * @file S7 (`fix-plan-tool-design-2026-09-24.md` row "content_post_update takes a partial patch")
 * — RED-first for the new partial-patch shape: `id`/`kind` are the only required fields, and
 * `title`/`slug`/`bodyJson`/`status` are each independently optional, filled from the stored row
 * for whatever the caller omits.
 */

const WORKSPACE_ID = "ws-post-partial-update";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-24T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

function fakeRouteDeps(postRepo: InMemoryPostRepo = new InMemoryPostRepo()) {
  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    postRepo,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as PostToolDeps;
  return { deps, postRepo };
}

function registrationsFor(deps: PostToolDeps): Map<string, ToolRegistration> {
  return new Map(
    buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() }).map((r) => [r.descriptor.id, r])
  );
}

/** Checked registry lookup — mirrors every sibling suite's own. */
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

async function seedPost(postRepo: InMemoryPostRepo) {
  await postRepo.save({
    id: "p1",
    workspaceId: WORKSPACE_ID,
    title: "Original Title",
    slug: "original-slug",
    bodyJson: EMPTY_DOC,
    status: "draft",
    kind: "post",
    updatedAt: NOW,
    version: 1,
  } as never);
}

async function storedPost(postRepo: InMemoryPostRepo) {
  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.ok(row, "expected the seeded post to still exist");
  return row;
}

/* ------------------------------------------------------------------------------------------------
 * (a) Title-only update
 * ---------------------------------------------------------------------------------------------- */

test("content_post_update: a title-only patch changes ONLY title — slug/bodyJson/status stay the stored values", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_update"), {
    id: "p1",
    kind: "post",
    title: "New Title",
  })) as { post: { title: string; slug: string; bodyJson: unknown; status: string } };

  assert.equal(result.post.title, "New Title");
  assert.equal(result.post.slug, "original-slug");
  assert.deepEqual(result.post.bodyJson, EMPTY_DOC);
  assert.equal(result.post.status, "draft");

  const after = await storedPost(postRepo);
  assert.equal(after.title, "New Title");
  assert.equal(after.slug, "original-slug");
  assert.deepEqual(after.bodyJson, EMPTY_DOC);
  assert.equal(after.status, "draft");
  assert.equal(after.version, 2);
});

/* ------------------------------------------------------------------------------------------------
 * (b) {id, kind, status:"published"} publishes — no separate set-status tool
 * ---------------------------------------------------------------------------------------------- */

test("content_post_update: {id, kind, status:'published'} alone publishes the row", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_update"), {
    id: "p1",
    kind: "post",
    status: "published",
  })) as { post: { status: string; title: string; slug: string } };

  assert.equal(result.post.status, "published");
  assert.equal(result.post.title, "Original Title");
  assert.equal(result.post.slug, "original-slug");

  const after = await storedPost(postRepo);
  assert.equal(after.status, "published");
});

/* ------------------------------------------------------------------------------------------------
 * (c) {id, kind} alone — nothing to change — is rejected, and nothing is written
 * ---------------------------------------------------------------------------------------------- */

test("content_post_update: {id, kind} alone is REJECTED — nothing to change", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const registrations = registrationsFor(deps);

  await assert.rejects(
    () => call(tool(registrations, "content_post_update"), { id: "p1", kind: "post" }),
    (err: unknown) =>
      err instanceof Error &&
      err.message === "content_post_update: send at least one of title, slug, bodyJson or status. Nothing was changed."
  );

  const after = await storedPost(postRepo);
  assert.equal(after.version, 1, "a rejected no-op call must not advance the row's version");
  assert.equal(after.title, "Original Title");
});

/* ------------------------------------------------------------------------------------------------
 * (d) A partial patch with no expectedVersion is still CAS-checked at write time
 * ---------------------------------------------------------------------------------------------- */

/**
 * A repo double whose READS are frozen to a version older than what is really stored — every
 * `findById` reports `frozenVersion` no matter how many times it is called, while `save`/
 * `saveIfVersion`/everything else operates on the real, current row. This is what "a human save
 * landed between this handler's read and `updatePost`'s write" looks like when driven through a
 * single, synchronous test call: both reads this ONE `content_post_update` invocation takes
 * (`captureInverse`'s own, then `updatePost`'s internal re-read) see the pre-save version, while
 * the row underneath has already moved past it — exactly the gap S7's `basisVersion` merge exists
 * to catch. Built as a `Proxy` rather than a subclass so every OTHER `PostRepoPort` method
 * (`transaction`, `appendRevision`, `findBySlug`, …) keeps its real, un-frozen behavior with no
 * per-method delegation to maintain.
 */
function staleReadPostRepo(inner: InMemoryPostRepo, frozenVersion: number): PostRepoPort {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === "findById") {
        return async (args: { workspaceId: string; id: string }) => {
          const row = await target.findById(args);
          return row ? { ...row, version: frozenVersion } : row;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as PostRepoPort;
}

test("content_post_update: a partial patch with no expectedVersion is still CAS-checked — VERSION_CONFLICT, not a silent clobber", async () => {
  const inner = new InMemoryPostRepo();
  // The row a concurrent human save already landed on — real, current version 2.
  await inner.save({
    id: "p1",
    workspaceId: WORKSPACE_ID,
    title: "Human's edit",
    slug: "original-slug",
    bodyJson: EMPTY_DOC,
    status: "draft",
    kind: "post",
    updatedAt: NOW,
    version: 2,
  } as never);
  // This handler's own read (and updatePost's internal re-read) sees only version 1 — the basis a
  // caller who read the row before the human's save would have had.
  const postRepo = staleReadPostRepo(inner, 1);
  const { deps } = fakeRouteDeps(postRepo as InMemoryPostRepo);
  const registrations = registrationsFor(deps);

  await assert.rejects(
    () => call(tool(registrations, "content_post_update"), { id: "p1", kind: "post", title: "Agent's title" }),
    (err: unknown) => err instanceof Error && err.message.includes("VERSION_CONFLICT")
  );

  // Nothing landed: the REAL stored row (read straight off `inner`, bypassing the stale proxy) is
  // still the human's edit, still at version 2.
  const real = await inner.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.ok(real);
  assert.equal(real!.title, "Human's edit");
  assert.equal(real!.version, 2);
});

/* ------------------------------------------------------------------------------------------------
 * (e) A title-only patch on a bespoke-HTML page succeeds — the omitted bodyJson is filled from
 * `existing` BEFORE the S3 html-body guard runs, not compared against the raw (absent) input.
 * ---------------------------------------------------------------------------------------------- */

async function seedHtmlPage(deps: PostToolDeps, postRepo: InMemoryPostRepo, html: string) {
  await createPost({
    deps: { repo: postRepo, clock: deps.clock },
    input: { workspaceId: WORKSPACE_ID, id: "page-1", title: "Pricing", kind: "page" },
  });
  const store = new InMemoryPagesHtmlDocumentStore(
    { workspaceId: WORKSPACE_ID, postId: "page-1" },
    { repo: postRepo, clock: deps.clock }
  );
  await store.ensureHtmlFormat(DEFAULT_PAGE_SKELETON);
  await store.read();
  await store.write(html);
}

test("content_post_update: a title-only patch on a bespoke-HTML page SUCCEEDS — the omitted bodyJson never reaches the S3 guard as a change", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  const generated = `<section data-agent-element="page-hero" data-agent-role="region"><h1>Pricing</h1></section>`;
  await seedHtmlPage(deps, postRepo, generated);
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_update"), {
    id: "page-1",
    kind: "page",
    title: "Pricing and plans",
  })) as { post: { title: string; version: number } };

  assert.equal(result.post.title, "Pricing and plans");

  const after = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "page-1" });
  assert.ok(after);
  assert.equal(after!.title, "Pricing and plans");
  assert.equal(after!.bodyFormat, "html");
  assert.equal(after!.bodyHtml, generated, "the html body must survive a title-only patch untouched");
});

/* ------------------------------------------------------------------------------------------------
 * (f) A SENT field keeps the full-record shape's validation: an empty title/slug is still rejected
 * ---------------------------------------------------------------------------------------------- */

test("content_post_update: an empty title or slug on a partial patch is rejected exactly as the full-record shape rejected it", async () => {
  for (const key of ["title", "slug"] as const) {
    const { deps, postRepo } = fakeRouteDeps();
    await seedPost(postRepo);
    const registrations = registrationsFor(deps);

    await assert.rejects(
      () => call(tool(registrations, "content_post_update"), { id: "p1", kind: "post", [key]: "" }),
      (err: unknown) => err instanceof Error && err.message.startsWith(`'${key}' (non-empty string) is required`)
    );
    assert.equal((await storedPost(postRepo)).version, 1, `a rejected empty ${key} must not write`);
  }
});

/* ------------------------------------------------------------------------------------------------
 * (g) A FULL four-field call with no expectedVersion gains no basis — the old opt-in behavior
 * ---------------------------------------------------------------------------------------------- */

test("content_post_update: a FULL four-field call with no expectedVersion is NOT auto-guarded — same last-write-wins save as before S7", async () => {
  const inner = new InMemoryPostRepo();
  await inner.save({
    id: "p1",
    workspaceId: WORKSPACE_ID,
    title: "Human's edit",
    slug: "original-slug",
    bodyJson: EMPTY_DOC,
    status: "draft",
    kind: "post",
    updatedAt: NOW,
    version: 2,
  } as never);
  const { deps } = fakeRouteDeps(staleReadPostRepo(inner, 1) as InMemoryPostRepo);
  const registrations = registrationsFor(deps);

  await call(tool(registrations, "content_post_update"), {
    id: "p1",
    kind: "post",
    title: "Agent's title",
    slug: "original-slug",
    bodyJson: EMPTY_DOC,
    status: "draft",
  });

  const real = await inner.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(real?.title, "Agent's title");
});
