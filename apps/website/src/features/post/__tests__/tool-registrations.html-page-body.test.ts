import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { createPost } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";
import { InMemoryPagesHtmlDocumentStore } from "../../pages/html-document-store.memory.js";
import { DEFAULT_PAGE_SKELETON } from "../../pages/skeleton.js";

/**
 * @file S3 (`fix-plan-web-high-2026-09-24.md` row 6) — `content_post_update` silently dropped an
 * agent-supplied `bodyJson` on a bespoke-HTML page instead of rejecting it. `updatePost` ignores
 * `bodyJson` for an html-format row by design (CIC-3 — see `post.body-format.test.ts` and
 * `metadata-edit-preserves-html.test.ts`), so the tool's own 200 response looked successful while
 * the caller's intended body edit silently never landed. `captureInverse` is the one place in this
 * handler that already reads the existing row before the write, so it is where the guard belongs.
 */

const WORKSPACE_ID = "ws-html-page-body";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-24T00:00:00.000Z";

function fakeRouteDeps() {
  let counter = 0;
  const postRepo = new InMemoryPostRepo();
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

/** Checked registry lookup — mirrors `tool-registrations.optimistic-concurrency.test.ts`'s own. */
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

/** Creates a Page and converts it to a bespoke-HTML one carrying `html`, the same technique
 *  `features/pages/__tests__/metadata-edit-preserves-html.test.ts`'s own `seedHtmlPage` uses. */
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

test("content_post_update: a different bodyJson on a bespoke-HTML page is REJECTED, not silently dropped", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  const generated = `<section data-agent-element="page-hero" data-agent-role="region"><h1>Pricing</h1></section>`;
  await seedHtmlPage(deps, postRepo, generated);
  const registrations = registrationsFor(deps);

  const before = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "page-1" });
  assert.ok(before);

  await assert.rejects(
    () =>
      call(tool(registrations, "content_post_update"), {
        id: "page-1",
        kind: "page",
        title: before!.title,
        slug: before!.slug,
        bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "new" }] }] },
        status: before!.status,
      }),
    (err: unknown) => err instanceof Error && err.message.startsWith("CONTENT_POST_HTML_BODY: page 'page-1'")
  );

  const after = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "page-1" });
  assert.ok(after);
  assert.equal(after!.version, before!.version, "a rejected edit must not advance the row's version");
  assert.equal(after!.bodyHtml, generated, "the generated body must survive verbatim");
});

test("content_post_update: sending bodyJson back exactly as content_post_get returned it still allows a metadata edit", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  const generated = `<section data-agent-element="page-body" data-agent-role="region"><p>Real content</p></section>`;
  await seedHtmlPage(deps, postRepo, generated);
  const registrations = registrationsFor(deps);

  const got = (await call(tool(registrations, "content_post_get"), { id: "page-1", kind: "page" })) as {
    post: { bodyJson: unknown; slug: string; status: string };
  };

  const updated = (await call(tool(registrations, "content_post_update"), {
    id: "page-1",
    kind: "page",
    title: "Pricing and plans",
    slug: got.post.slug,
    bodyJson: got.post.bodyJson,
    status: got.post.status,
  })) as { post: { title: string; version: number } };

  assert.equal(updated.post.title, "Pricing and plans");

  const after = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "page-1" });
  assert.ok(after);
  assert.equal(after!.title, "Pricing and plans");
  assert.equal(after!.bodyFormat, "html");
  assert.equal(after!.bodyHtml, generated, "the html body must survive the metadata edit");
});
