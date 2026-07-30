import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryChangeSetRepo } from "../../core/commands";
import { InMemoryEventBus, InMemoryOutbox } from "../../core/events";
import { InMemoryPostRepo } from "../../features/post";
import { postAgentToolCatalog, type AgentToolDefinition as PostAgentToolDefinition } from "../../features/post/agent-tools";
import type { RouteDeps } from "../../server/routes/types";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations";

/**
 * @file The Posts + Pages tool-wiring test file — mirrors `tool-registrations.entries.test.ts`'s/
 * `tool-registrations.plugins.test.ts`'s own shape: catalog completeness, published contract
 * parity, the risk cross-check, the ADR-021 §2 authorization half (2 inline-gated reads + 2
 * executeCommand-gated writes, the same split `tool-registrations.plugins.test.ts` covers for a
 * domain with no self-enforcing write-service layer of its own), field-validation shape rejection,
 * and a multi-tool workflow test chaining create -> update(bodyJson) -> publish -> list, for both a
 * post and a page.
 *
 * Real in-memory adapters throughout (`InMemoryPostRepo`, `InMemoryChangeSetRepo`, `InMemoryOutbox`,
 * `InMemoryEventBus`), no mocking of the chokepoint itself, per Constitution Article V
 * (Integration-First Testing) — mirrors `tool-registrations.entries.test.ts`'s identical discipline.
 */

const WORKSPACE_ID = "ws-post-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-30T00:00:00.000Z";

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const postRepo = new InMemoryPostRepo();
  const changeSets = new InMemoryChangeSetRepo();
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const authorizeCalls: Array<Record<string, unknown>> = [];

  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    changeSets,
    outbox,
    bus,
    postRepo,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  return { deps: deps as unknown as RouteDeps, postRepo, changeSets, outbox, bus, authorizeCalls };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): PostAgentToolDefinition {
  const entry = postAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function postRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("content_post_")).map((r) => [r.descriptor.id, r]));
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = postRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

const EMPTY_DOC = { type: "doc", content: [] };

const RICH_DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Hello World" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "This is " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " and a " },
        { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
        { type: "text", text: "." },
      ],
    },
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item one" }] }] }],
    },
  ],
};

// ---------------------------------------------------------------------------
// 1. Catalog completeness
// ---------------------------------------------------------------------------

test("exactly the 5 Posts/Pages operations are wired — the entire catalog", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual(
    [...postRegistrations(deps).keys()].sort(),
    ["content_post_create", "content_post_delete", "content_post_get", "content_post_list", "content_post_update"],
  );
  assert.equal(postAgentToolCatalog.length, 5, "sanity: no catalog entry is silently excluded");
});

/**
 * This test previously read "no delete/purge/publish/unpublish tool exists" and asserted that no
 * wired id matched `/delete|purge|publish|unpublish/`. The delete half of that claim was retired
 * on purpose: `post.ts` now exports `deletePost`, `PostRepoPort` carries `softDelete`, and
 * `server/routes/admin/posts/delete.ts`/`.../pages/delete.ts` are the human routes
 * `content_post_delete` mirrors — so a delete tool no longer names an operation the domain cannot
 * perform, which was the rule the old assertion enforced.
 *
 * The publish/unpublish half is UNCHANGED and still enforced below, because that reason still
 * holds: `post.ts` has exactly one write path for status changes (`updatePost`'s `status` field),
 * so a `content_post_publish` tool would still be inventing a function the domain does not have.
 */
test("no purge/publish/unpublish tool exists — post.ts still has no hard-delete and no separate lifecycle function", () => {
  const { deps } = fakeRouteDeps();
  for (const id of postRegistrations(deps).keys()) {
    assert.equal(/purge|publish|unpublish/i.test(id), false, `'${id}' must not imply an operation post.ts cannot perform`);
  }
});

test("the delete tool is a SOFT delete and says so — its description must not promise permanence", () => {
  const entry = catalogEntry("content_post_delete");
  assert.match(entry.description, /SOFT delete/);
  assert.match(entry.description, /restored by reverting/i);
  assert.match(entry.description, /TWO-STEP AND HUMAN-GATED/);
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired Posts/Pages registration publishes its catalog entry's inputSchema and description verbatim", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of postRegistrations(deps)) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's, not a second copy`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired Posts/Pages tool", () => {
  const { deps } = fakeRouteDeps();
  for (const [, registration] of postRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined);
  }
});

test("content_post_create's and content_post_update's published bodyJson schema names every renderDocNode node type", () => {
  const schema = catalogEntry("content_post_update").inputSchema as { properties: { bodyJson: { $defs: { blockNode: { oneOf: Array<{ properties: { type: { const: string } } }> } } } } };
  const names = schema.properties.bodyJson.$defs.blockNode.oneOf.map((entry) => entry.properties.type.const);
  assert.deepEqual(
    names.sort(),
    ["blockquote", "bulletList", "codeBlock", "heading", "horizontalRule", "orderedList", "paragraph", "widgetEmbed"].sort(),
  );
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the independent risk classification agrees with the catalog for all 5 wired Posts/Pages tools", () => {
  const { deps } = fakeRouteDeps();
  for (const id of postRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a catalog entry cannot downgrade its own risk — declaring content_post_create sideEffects:'none' fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("content_post_create", { ...catalogEntry("content_post_create"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("content_post_delete is classified as genuinely destructive, distinctly from an edit", () => {
  assert.equal(catalogEntry("content_post_delete").sideEffects, "deletes-durable-state");
  assert.doesNotThrow(() => assertRiskMetadataIsWirable("content_post_delete", catalogEntry("content_post_delete")));
});

test("content_post_delete cannot soften itself to a mere mutation — the independent check refuses it", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("content_post_delete", { ...catalogEntry("content_post_delete"), sideEffects: "mutates-durable-state" }),
    /declares sideEffects 'mutates-durable-state' but this layer derives 'deletes-durable-state'/,
    "folding a delete into the same bucket as an edit is exactly what the separate union member exists to catch",
  );
});

test("content_post_delete cannot downgrade itself to 'none' either", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("content_post_delete", { ...catalogEntry("content_post_delete"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'deletes-durable-state'/,
  );
});

test("no OTHER Posts/Pages tool may claim the destructive classification", () => {
  const { deps } = fakeRouteDeps();
  for (const id of postRegistrations(deps).keys()) {
    if (id === "content_post_delete") continue;
    assert.notEqual(catalogEntry(id).sideEffects, "deletes-durable-state", `${id} is not a delete`);
  }
});

test("content_post_delete does NOT use requiresConfirmation — its gate is a real MCP-UI resource, not the unwired boolean", () => {
  const { deps } = fakeRouteDeps();
  const registration = postRegistrations(deps).get("content_post_delete");
  assert.ok(registration);
  assert.equal(
    registration.descriptor.requiresConfirmation,
    undefined,
    "setting it would park the execution forever with no ExecutionDelegate wired (see ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT)",
  );
  assert.equal(
    catalogEntry("content_post_delete").actorClassRule,
    undefined,
    "declaring confirmer-must-equal-own-delegatedBy would correctly fail the build for a transport this tool does not use",
  );
});

test("the ToolPolicy layer is a pass-through 'allow' for every wired Posts/Pages registration", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of postRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 4. Authorization (ADR-021 §2) — 2 inline-gated reads (content.read) + 2 executeCommand-gated
//    writes (content.write), mirroring tool-registrations.plugins.test.ts's identical split for a
//    domain with no self-enforcing write-service layer.
// ---------------------------------------------------------------------------

test("content_post_list: calls authorize() with content.read, inline (listAdminPosts has no authorize of its own)", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();
  authorizeCalls.length = 0;

  await wired("content_post_list", deps).handler(executionContext({ kind: "post" }));

  assert.equal(authorizeCalls.length, 1);
  assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
  assert.equal(authorizeCalls[0].permission, "content.read");
});

test("content_post_list: a denied principal is rejected", async () => {
  const { deps } = fakeRouteDeps({ allow: false });
  await assert.rejects(() => wired("content_post_list", deps).handler(executionContext({ kind: "post" })), /is not authorized for 'content\.read'/);
});

test("content_post_get: calls authorize() with content.read, inline", async () => {
  const { deps, postRepo, authorizeCalls } = fakeRouteDeps();
  await postRepo.save({ id: "p1", workspaceId: WORKSPACE_ID, title: "T", slug: "t", bodyJson: EMPTY_DOC, status: "draft", kind: "post", updatedAt: NOW, version: 1 });
  authorizeCalls.length = 0;

  await wired("content_post_get", deps).handler(executionContext({ id: "p1", kind: "post" }));

  assert.equal(authorizeCalls.length, 1);
  assert.equal(authorizeCalls[0].permission, "content.read");
});

test("content_post_get: a denied principal is rejected", async () => {
  const { deps } = fakeRouteDeps({ allow: false });
  await assert.rejects(() => wired("content_post_get", deps).handler(executionContext({ id: "nonexistent", kind: "post" })), /is not authorized for 'content\.read'/);
});

test("content_post_create: calls authorize() with content.write via executeCommand", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();
  authorizeCalls.length = 0;

  await wired("content_post_create", deps).handler(executionContext({ kind: "post", title: "My Post" }));

  assert.ok(authorizeCalls.length >= 1);
  assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
  assert.equal(authorizeCalls[0].permission, "content.write");
});

test("content_post_create: a denied principal is rejected and nothing is written", async () => {
  const { deps, postRepo } = fakeRouteDeps({ allow: false });
  await assert.rejects(
    () => wired("content_post_create", deps).handler(executionContext({ kind: "post", title: "My Post" })),
    /is not authorized for 'content\.write'/,
  );
  assert.equal((await postRepo.list({ workspaceId: WORKSPACE_ID })).length, 0);
});

test("content_post_update: a denied principal is rejected and nothing is written", async () => {
  const { deps, postRepo } = fakeRouteDeps({ allow: false });
  await postRepo.save({ id: "p1", workspaceId: WORKSPACE_ID, title: "T", slug: "t", bodyJson: EMPTY_DOC, status: "draft", kind: "post", updatedAt: NOW, version: 1 });

  await assert.rejects(
    () => wired("content_post_update", deps).handler(executionContext({ id: "p1", kind: "post", title: "T2", slug: "t", bodyJson: EMPTY_DOC, status: "draft" })),
    /is not authorized for 'content\.write'/,
  );

  const untouched = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(untouched?.title, "T", "the denied call must not have changed the existing row");
  assert.equal(untouched?.version, 1);
});

// ---------------------------------------------------------------------------
// 5. Field-validation shape rejection
// ---------------------------------------------------------------------------

test("content_post_create rejects a malformed slug, with the schema attached for retry", async () => {
  const { deps } = fakeRouteDeps();

  const error = await wired("content_post_create", deps)
    .handler(executionContext({ kind: "post", title: "Bad Slug", slug: "Not Valid!" }))
    .then(
      () => null,
      (e: unknown) => e as Error,
    );

  assert.ok(error, "a malformed slug must reject");
  assert.match(error.message, /slug must use lowercase letters, numbers, and dashes/);
  assert.match(error.message, /will not resolve on retry without an input change/);
  assert.match(error.message, /"required":\["kind","title"\]/, "the published schema must travel with the failure");
});

test("content_post_update rejects a non-JSON-object bodyJson", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await postRepo.save({ id: "p1", workspaceId: WORKSPACE_ID, title: "T", slug: "t", bodyJson: EMPTY_DOC, status: "draft", kind: "post", updatedAt: NOW, version: 1 });

  await assert.rejects(
    () => wired("content_post_update", deps).handler(executionContext({ id: "p1", kind: "post", title: "T", slug: "t", bodyJson: "not an object", status: "draft" })),
    /\(object\) is required/,
  );
});

test("content_post_get: kind:'page' rejects a row whose actual kind is 'post' (the guarded, pages/get-by-id.ts-mirroring branch)", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await postRepo.save({ id: "p1", workspaceId: WORKSPACE_ID, title: "T", slug: "t", bodyJson: EMPTY_DOC, status: "draft", kind: "post", updatedAt: NOW, version: 1 });

  await assert.rejects(() => wired("content_post_get", deps).handler(executionContext({ id: "p1", kind: "page" })), /page 'p1' was not found/);
});

test("content_post_get: kind:'post' still returns a row whose actual kind is 'page' (the disclosed, posts/get-by-id.ts-mirroring legacy laxity)", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await postRepo.save({ id: "pg1", workspaceId: WORKSPACE_ID, title: "T", slug: "t", bodyJson: EMPTY_DOC, status: "draft", kind: "page", updatedAt: NOW, version: 1 });

  const out = (await wired("content_post_get", deps).handler(executionContext({ id: "pg1", kind: "post" }))) as { post: { id: string; kind: string } };
  assert.equal(out.post.id, "pg1");
  assert.equal(out.post.kind, "page", "the legacy lookup does not filter by the requested kind");
});

// ---------------------------------------------------------------------------
// 6. Multi-tool workflow — create -> update(bodyJson) -> publish -> list, id/version threaded
//    throughout, for both a post and a page.
// ---------------------------------------------------------------------------

test("workflow (post): create a post, give it a real TipTap body, publish it, then confirm it appears in the published list", async () => {
  const { deps } = fakeRouteDeps();

  // Step 1: create.
  const created = (await wired("content_post_create", deps).handler(executionContext({ kind: "post", title: "My Article" }))) as {
    post: { id: string; kind: string; status: string; version: number; bodyJson: unknown };
  };
  assert.equal(created.post.kind, "post");
  assert.equal(created.post.status, "draft");
  assert.equal(created.post.version, 1);
  assert.deepEqual(created.post.bodyJson, EMPTY_DOC, "an omitted bodyJson must default to the empty TipTap doc");
  const postId = created.post.id;

  // Step 2: update its bodyJson with real TipTap content, using the id step 1 returned.
  const updated = (await wired("content_post_update", deps).handler(
    executionContext({ id: postId, kind: "post", title: "My Article", slug: "my-article", bodyJson: RICH_DOC, status: "draft" }),
  )) as { post: { id: string; bodyJson: unknown; version: number; status: string } };
  assert.equal(updated.post.id, postId, "the update must operate on the SAME post created in step 1");
  assert.deepEqual(updated.post.bodyJson, RICH_DOC);
  assert.equal(updated.post.version, 2, "version must have advanced from step 1's version 1");
  assert.equal(updated.post.status, "draft", "this update must not itself have published the post");

  // Step 3: publish — a content_post_update call with status:'published', chained off step 2's own
  // returned version/slug/bodyJson (post.ts has no separate publish function to call instead).
  const published = (await wired("content_post_update", deps).handler(
    executionContext({ id: postId, kind: "post", title: "My Article", slug: "my-article", bodyJson: RICH_DOC, status: "published" }),
  )) as { post: { id: string; status: string; version: number } };
  assert.equal(published.post.id, postId);
  assert.equal(published.post.status, "published");
  assert.equal(published.post.version, 3);

  // Step 4: list — the published post must appear in a FRESH read, proving state actually
  // persisted rather than the tool merely reporting success.
  const listed = (await wired("content_post_list", deps).handler(executionContext({ kind: "post" }))) as {
    posts: Array<{ id: string; status: string; version: number; bodyJson: unknown }>;
  };
  const row = listed.posts.find((p) => p.id === postId);
  assert.ok(row, "the post must appear in the post list");
  assert.equal(row.status, "published");
  assert.equal(row.version, 3);
  assert.deepEqual(row.bodyJson, RICH_DOC, "the rich TipTap body from step 2 must still be intact after publishing");
});

test("workflow (page): create a page, give it a real TipTap body, publish it, then confirm it appears in the published list — and is invisible to the post list", async () => {
  const { deps } = fakeRouteDeps();

  // Step 1: create, kind:'page'.
  const created = (await wired("content_post_create", deps).handler(executionContext({ kind: "page", title: "About Us" }))) as {
    post: { id: string; kind: string; status: string; version: number };
  };
  assert.equal(created.post.kind, "page");
  assert.equal(created.post.status, "draft");
  const pageId = created.post.id;

  // Step 2: update its bodyJson.
  const updated = (await wired("content_post_update", deps).handler(
    executionContext({ id: pageId, kind: "page", title: "About Us", slug: "about-us", bodyJson: RICH_DOC, status: "draft" }),
  )) as { post: { id: string; bodyJson: unknown; version: number } };
  assert.equal(updated.post.id, pageId);
  assert.deepEqual(updated.post.bodyJson, RICH_DOC);

  // Step 3: publish.
  const published = (await wired("content_post_update", deps).handler(
    executionContext({ id: pageId, kind: "page", title: "About Us", slug: "about-us", bodyJson: RICH_DOC, status: "published" }),
  )) as { post: { id: string; status: string; version: number } };
  assert.equal(published.post.status, "published");
  assert.equal(published.post.version, 3);

  // Step 4a: list(kind:'page') — the published page must appear.
  const pages = (await wired("content_post_list", deps).handler(executionContext({ kind: "page" }))) as {
    posts: Array<{ id: string; status: string }>;
  };
  const pageRow = pages.posts.find((p) => p.id === pageId);
  assert.ok(pageRow, "the page must appear in the page list");
  assert.equal(pageRow.status, "published");

  // Step 4b: list(kind:'post') — a page must never surface on the post list (PostKind's own doc).
  const posts = (await wired("content_post_list", deps).handler(executionContext({ kind: "post" }))) as {
    posts: Array<{ id: string }>;
  };
  assert.equal(
    posts.posts.some((p) => p.id === pageId),
    false,
    "a page must not surface in the post list",
  );

  // Step 5: content_post_get(kind:'page') cross-check — confirms the same row is independently
  // readable by id, not just present in the list projection.
  const fetched = (await wired("content_post_get", deps).handler(executionContext({ id: pageId, kind: "page" }))) as { post: { id: string; status: string } };
  assert.equal(fetched.post.id, pageId);
  assert.equal(fetched.post.status, "published");
});
