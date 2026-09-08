import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { buildContentDuplicationRegistrations } from "#src/features/content-duplication/tool-registrations";
import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { InMemoryPostRepo } from "../repo.memory.js";
import { contributePostDuplicateHandlers, type PostToolDeps } from "../tool-registrations.js";
import { InMemoryPagesHtmlDocumentStore } from "../../pages/html-document-store.memory.js";

/**
 * @file Certifies this domain's `"post"` and `"page"` contributions to the CROSS-RESOURCE
 * `content_duplicate` tool (`features/content-duplication/`) — the "copy Landing sample — xai and
 * name it 'Landing Page'" gap (`ADS-memory/reports/2026-09-07-page-tool-gap.md` /
 * `-page-duplicate-tool.md`).
 *
 * Renamed from `tool-registrations.duplicate.test.ts` when the owner's follow-up correction folded
 * the bespoke `content_post_duplicate` tool into one generic `content_duplicate` over a `resource`
 * parameter. Every case below is the SAME case it was, re-pointed at the generic tool: the old
 * `{ id, kind }` input is now `{ resource, id }`, and `{ title, slug, status }` moved under
 * `overrides`. No assertion was weakened in the move.
 *
 * The load-bearing case in here is the widgetEmbed one: a naive byte-for-byte `bodyJson` copy would
 * carry the source page's `placementId` verbatim onto the new row, which is the "silent shared-state
 * corruption" this whole tool was built to close correctly (see `duplicate-embeds.ts`'s own header).
 * `"source untouched"` is asserted explicitly in that test, not just "copy looks right in isolation".
 *
 * The handler contributions are passed to `buildContentDuplicationRegistrations` DIRECTLY rather
 * than through `assistant/duplicate-resource-registry.ts`'s module-level registry — the same seam
 * the composition root uses, minus the shared global state a parallel test file could otherwise
 * pollute.
 */

const WORKSPACE_ID = "ws-duplicate-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-07T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

function fakeRouteDeps(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  } as unknown as PostToolDeps;

  return { deps, postRepo };
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
    id: "source-1",
    workspaceId: WORKSPACE_ID,
    title: "Landing sample — xai",
    slug: "landing-sample-xai",
    bodyJson: EMPTY_DOC,
    bodyFormat: "doc" as const,
    bodyHtml: null,
    status: "published" as const,
    kind: "page" as const,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
  await postRepo.save(row as never);
  return row;
}

function registrationsFor(deps: PostToolDeps): Map<string, ToolRegistration> {
  const registrations = buildContentDuplicationRegistrations(deps as unknown as AssistantToolRegistryDeps, {
    listResourceHandlers: contributePostDuplicateHandlers,
  });
  return new Map(registrations.map((r) => [r.descriptor.id, r]));
}

test("content_duplicate is wired, and this domain contributes both 'post' and 'page'", async () => {
  const { deps } = fakeRouteDeps();
  const registrations = registrationsFor(deps);
  assert.ok(registrations.has("content_duplicate"));
  assert.deepEqual(
    contributePostDuplicateHandlers().map((c) => c.resource).sort(),
    ["page", "post"],
  );
});

test("copies title/slug/status defaults: source title with a numeric suffix, derived slug, ALWAYS draft even for a published source", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { status: "published" });
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_duplicate"), { resource: "page", id: "source-1" })) as {
    post: { id: string; title: string; slug: string; status: string; kind: string };
  };

  assert.notEqual(result.post.id, "source-1", "must be a NEW row, never the source's own id");
  assert.equal(result.post.title, "Landing sample — xai 2", "never 'Copy of <title>' — a numeric suffix instead");
  assert.equal(result.post.slug, "landing-sample-xai-2", "the slug follows the numbered title, not a separate derivation");
  assert.equal(result.post.status, "draft", "a copy must never silently go live, even from a published source");
  assert.equal(result.post.kind, "page");

  const sourceStillThere = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "source-1" });
  assert.equal(sourceStillThere?.status, "published", "the source row must be completely untouched");
});

test("copying the same source twice increments the suffix: '... 2', then '... 3'", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const registrations = registrationsFor(deps);

  const first = (await call(tool(registrations, "content_duplicate"), { resource: "page", id: "source-1" })) as {
    post: { title: string; slug: string };
  };
  const second = (await call(tool(registrations, "content_duplicate"), { resource: "page", id: "source-1" })) as {
    post: { title: string; slug: string };
  };

  assert.equal(first.post.title, "Landing sample — xai 2");
  assert.equal(second.post.title, "Landing sample — xai 3");
  assert.equal(second.post.slug, "landing-sample-xai-3");
});

test("explicit title, slug, and status overrides are honored when supplied", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_duplicate"), {
    resource: "page",
    id: "source-1",
    overrides: { title: "Landing Page", slug: "landing-page", status: "published" },
  })) as { post: { title: string; slug: string; status: string } };

  assert.equal(result.post.title, "Landing Page");
  assert.equal(result.post.slug, "landing-page");
  assert.equal(result.post.status, "published");
});

test("resource:'page' rejects an actual kind:'post' row as not-found (disclosed asymmetry, matching content_post_get)", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { kind: "post" });
  const registrations = registrationsFor(deps);

  await assert.rejects(
    call(tool(registrations, "content_duplicate"), { resource: "page", id: "source-1" }),
    /was not found/,
  );
});

test("resource:'post' against an actual kind:'page' row is NOT guarded — the copy is itself a page (asymmetry mirrors content_post_get)", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { kind: "page" });
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_duplicate"), { resource: "post", id: "source-1" })) as {
    post: { kind: string };
  };

  assert.equal(result.post.kind, "page", "the copy's kind always matches the SOURCE's real kind, not the caller's disambiguation input");
});

test("duplicating a nonexistent id is rejected as not-found", async () => {
  const { deps } = fakeRouteDeps();
  const registrations = registrationsFor(deps);

  await assert.rejects(
    call(tool(registrations, "content_duplicate"), { resource: "page", id: "does-not-exist" }),
    /was not found/,
  );
});

test("an explicit slug already taken by another row is rejected exactly like content_post_create's own slug collision", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  await seedPost(postRepo, { id: "other-row", slug: "taken-slug" });
  const registrations = registrationsFor(deps);

  await assert.rejects(
    call(tool(registrations, "content_duplicate"), { resource: "page", id: "source-1", overrides: { slug: "taken-slug" } }),
    /already exists/,
  );
});

test("a permission-denied caller cannot duplicate anything", async () => {
  const { deps, postRepo } = fakeRouteDeps({ authorize: async () => ({ allowed: false, reason: "denied" }) });
  await seedPost(postRepo);
  const registrations = registrationsFor(deps);

  await assert.rejects(call(tool(registrations, "content_duplicate"), { resource: "page", id: "source-1" }));
});

// ---------------------------------------------------------------------------------------------
// widgetEmbed handling — the load-bearing case this tool exists for.
// ---------------------------------------------------------------------------------------------

test("a widgetEmbed in the source body gets a FRESH placementId on the copy, keeping the same widgetEntryId, and the SOURCE is unchanged", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  const sourceBodyJson = {
    type: "doc",
    content: [{ type: "widgetEmbed", attrs: { placementId: "source-placement-1", widgetEntryId: "widget-shared-footer" } }],
  };
  await seedPost(postRepo, { bodyJson: sourceBodyJson });
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_duplicate"), { resource: "page", id: "source-1" })) as {
    post: { id: string; bodyJson: { content: Array<{ attrs: { placementId: string; widgetEntryId: string } }> } };
  };

  const copiedEmbed = result.post.bodyJson.content[0]!;
  assert.notEqual(copiedEmbed.attrs.placementId, "source-placement-1", "the copy must never carry the source's own placementId");
  assert.equal(copiedEmbed.attrs.widgetEntryId, "widget-shared-footer", "the copy legitimately references the same live widget instance");

  const sourceRow = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "source-1" });
  const sourceEmbed = (sourceRow!.bodyJson as typeof sourceBodyJson).content[0]!;
  assert.equal(sourceEmbed.attrs.placementId, "source-placement-1", "the SOURCE row's own bodyJson must be completely untouched by duplicating it");
});

// ---------------------------------------------------------------------------------------------
// bespoke-HTML pages
// ---------------------------------------------------------------------------------------------

function withPagesHtmlStore(deps: PostToolDeps, postRepo: InMemoryPostRepo): PostToolDeps {
  return {
    ...deps,
    pagesHtmlStore: (scope: { workspaceId: string; postId: string }) =>
      new InMemoryPagesHtmlDocumentStore(scope, { repo: postRepo, clock: { nowIso: () => NOW } }),
  } as PostToolDeps;
}

test("an HTML-format source page's body_html is copied onto the new row when a pagesHtmlStore is wired", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { bodyFormat: "html", bodyHtml: "<p data-agent-element=\"hero\" data-agent-role=\"region\">Hello</p>", bodyJson: EMPTY_DOC });
  const depsWithStore = withPagesHtmlStore(deps, postRepo);
  const registrations = registrationsFor(depsWithStore);

  const result = (await call(tool(registrations, "content_duplicate"), { resource: "page", id: "source-1" })) as {
    post: { id: string };
  };

  const copiedRow = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: result.post.id });
  assert.equal(copiedRow?.bodyFormat, "html");
  assert.equal(copiedRow?.bodyHtml, '<p data-agent-element="hero" data-agent-role="region">Hello</p>');

  const sourceRow = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "source-1" });
  assert.equal(sourceRow?.bodyHtml, '<p data-agent-element="hero" data-agent-role="region">Hello</p>', "the source page's own HTML must be untouched");
});

test("duplicating an HTML-format page with NO pagesHtmlStore wired fails loudly and writes NOTHING — content is never silently dropped", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { bodyFormat: "html", bodyHtml: "<p>Real content</p>", bodyJson: EMPTY_DOC });
  const registrations = registrationsFor(deps);
  const rowCountBefore = (await postRepo.list({ workspaceId: WORKSPACE_ID })).length;

  await assert.rejects(
    call(tool(registrations, "content_duplicate"), { resource: "page", id: "source-1" }),
    /html/i,
  );

  const rowCountAfter = (await postRepo.list({ workspaceId: WORKSPACE_ID })).length;
  assert.equal(rowCountAfter, rowCountBefore, "no orphan draft row may be created when the HTML body genuinely cannot be copied");
});
