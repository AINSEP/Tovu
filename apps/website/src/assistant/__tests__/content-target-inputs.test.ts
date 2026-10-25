import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryMediaRepo, buildMediaRegistrations, type MediaRecord } from "@jini-ai/cms/media";
import { bareDeps, barePost } from "../../server/inbound/admin-http/routes/posts/__tests__/preview-fixtures.js";
import { buildPostPreviewRegistrations } from "../../features/post/preview-tool.js";
import { postAgentToolCatalog } from "../../features/post/agent-tools.js";
import { buildPagesRegistrations } from "../../features/pages/tool-registrations.js";
import { InMemoryPagesHtmlDocumentStore } from "../../features/pages/html-document-store.memory.js";
import { deriveContentReadRegistrations } from "../content-read-tool.js";
import { applyBatchInputs, type BatchResult } from "../batch-tool-inputs.js";
import { executeRegisteredTool } from "./fixtures/execute-registered-tool.js";
import { withContentTargets } from "./fixtures/content-target-inputs.js";
import { withBatchInput } from "@jini-ai/core";
import { permanentDeleteAgentToolCatalog } from "../../features/permanent-delete/agent-tools.js";
import { getSeoAgentToolCatalog } from "../../features/seo/agent-tools.js";

function mediaRecord({ id, slug, workspaceId = "w" }: { id: string; slug: string; workspaceId?: string }): MediaRecord {
  return { id, slug, workspaceId, title: slug, alt: "", caption: "", credit: "", source: { sha256: id }, status: "active",
    version: 1, createdAt: "2026-10-24T00:00:00Z", updatedAt: "2026-10-24T00:00:00Z", createdBy: "caller",
    width: null, height: null, cssClass: null, htmlAttributes: null };
}

test("shared content target input resolves preview slug, root id, and legacy postId in default batches", async () => {
  const { deps, writes } = bareDeps([{ ...barePost, slug: "/" }]);
  const rendered: string[] = [];
  const registrations = withContentTargets({ deps, registrations: buildPostPreviewRegistrations(deps, {
    renderPostPreview: async (_deps, { post }) => { rendered.push(post.id); return { html: "<p>Home</p>", templateChoice: "" }; },
  }) });
  const registration = applyBatchInputs({ registrations })[0]!;
  const input = { items: [{ slug: "/" }, { id: "/" }, { postId: "/" }, { id: "missing" }, { id: barePost.id, invented: true }] };
  const before = structuredClone(input);
  const execution = await executeRegisteredTool({ registration, input });
  assert.equal(execution.status, "completed");
  const output = execution.output as BatchResult;
  assert.deepEqual(output.results.map(item => item.ok), [true, true, true, false, false]);
  assert.deepEqual(rendered, [barePost.id, barePost.id, barePost.id]);
  assert.equal(writes(), 0);
  assert.deepEqual(input, before);
});

test("shared content target input handles media card reads and list batches, metadata edits and trash", async () => {
  const { deps } = bareDeps();
  const mediaRepo = new InMemoryMediaRepo({});
  await mediaRepo.save(mediaRecord({ id: "asset-1", slug: "dashboard" }));
  await mediaRepo.save(mediaRecord({ id: "asset-2", slug: "logo" }));
  await mediaRepo.save(mediaRecord({ id: "shadow", slug: "asset-1" }));
  await mediaRepo.save(mediaRecord({ id: "foreign", slug: "private", workspaceId: "other" }));
  const site = { ...deps, mediaRepo };
  const raw = buildMediaRegistrations(site);
  const cards = deriveContentReadRegistrations(raw);
  const registrations = applyBatchInputs({ registrations: withContentTargets({ registrations: cards, deps: site }) });
  const registration = registrations.find(tool => tool.descriptor.id === "content_read.media_asset")!;
  const result = await executeRegisteredTool({ registration, input: { items: [{ id: "dashboard" }, { slug: "logo" }, { id: "missing" }, {}, { id: "private" }, { id: "asset-1" }] } });
  assert.equal(result.status, "completed");
  const output = result.output as BatchResult;
  assert.deepEqual(output.results.map(item => item.ok), [true, true, false, true, false, true]);
  const assets = (index: number) => (output.results[index] as { result: { media: Array<{ id: string }> } }).result.media.map(asset => asset.id);
  assert.deepEqual(assets(0), ["asset-1"]);
  assert.deepEqual(assets(1), ["asset-2"]);
  assert.deepEqual(assets(3), ["asset-1", "asset-2", "shadow"]);
  assert.deepEqual(assets(5), ["asset-1"], "a slug matching another asset's id must not redirect that id");
  for (const [toolId, input] of [["media_update_metadata", { mediaId: "dashboard", alt: "A dashboard" }], ["media_trash_asset", { mediaId: "logo" }]] as const) {
    const registration = registrations.find(tool => tool.descriptor.id === toolId)!;
    assert.equal((await executeRegisteredTool({ registration, input })).status, "completed");
  }
  assert.equal((await mediaRepo.findById({ workspaceId: "w", id: "asset-1" }))!.alt, "A dashboard");
  assert.equal((await mediaRepo.findById({ workspaceId: "w", id: "asset-2" }))!.status, "trashed");
});

test("shared lookup follows authorization for reads and writes", async () => {
  const { deps, repo } = bareDeps();
  const denied = { ...deps, authorize: async () => ({ allowed: false, reason: "denied" }) };
  repo.findById = repo.findBySlug = async () => assert.fail("permission must precede target lookup");
  const registration = withContentTargets({ deps: denied, registrations: buildPostPreviewRegistrations(denied, {
    renderPostPreview: async () => assert.fail("denied previews must not render"),
  }) })[0]!;
  const result = await executeRegisteredTool({ registration, input: { slug: "/" } });
  assert.notEqual(result.status, "completed");
  assert.match(result.error!, /not authorized/);
  let input: unknown;
  const [write] = withContentTargets({ deps: { ...denied, mediaRepo: {
    findById: async () => assert.fail("denied media writes must not look up an id"),
    findBySlug: async () => assert.fail("denied media writes must not look up a slug"),
  } }, registrations: [{ descriptor: { id: "media_update_metadata", sideEffects: "mutates-durable-state", inputSchema: {
    type: "object", properties: { mediaId: { type: "string" } },
  } }, policy: { authorize: () => "allow" }, handler: async ctx => { input = ctx.input; } }] });
  assert.notEqual((await executeRegisteredTool({ registration: write!, input: { mediaId: "dashboard" } })).status, "completed");
  assert.equal(input, undefined);
});

test("a post update resolves its id while preserving the requested new slug", async () => {
  const { deps } = bareDeps();
  const definition = postAgentToolCatalog.find(tool => tool.name === "content_post_update")!;
  let received: unknown;
  const [registration] = withContentTargets({ deps, registrations: [{
    descriptor: { id: definition.name, inputSchema: definition.inputSchema, sideEffects: "mutates-durable-state" },
    policy: { authorize: () => "allow" }, handler: async ctx => { received = ctx.input; return {}; },
  }] });
  const result = await executeRegisteredTool({ registration: registration!, input: { id: barePost.slug, kind: "page", slug: "new-slug" } });
  assert.equal(result.status, "completed");
  assert.deepEqual(received, { id: barePost.id, kind: "page", slug: "new-slug" });
});

test("SEO entryId uses the same post resolver and retains its SEO authorization resource", async () => {
  const { deps } = bareDeps();
  const definition = getSeoAgentToolCatalog().find(tool => tool.name === "seo_analyze_entry")!;
  let received: unknown;
  const [registration] = withContentTargets({ deps: { ...deps, authorize: async (input: { permission: string; entityType: string }) => {
    assert.equal(input.permission, "admin.seo.manage");
    assert.equal(input.entityType, "seo-entry");
    return { allowed: true, reason: "test" };
  } }, registrations: [{ descriptor: { id: definition.name, inputSchema: definition.inputSchema, sideEffects: "none" },
    policy: { authorize: () => "allow" }, handler: async ctx => { received = ctx.input; return {}; } }] });
  assert.equal((await executeRegisteredTool({ registration: registration!, input: { entryId: barePost.slug } })).status, "completed");
  assert.deepEqual(received, { entryId: barePost.id });
});

test("page writes use the shared root resolver and still validate page kind and version", async () => {
  const { deps, repo } = bareDeps([{ ...barePost, slug: "/" }, { ...barePost, id: "ordinary-post", slug: "news", kind: "post" }]);
  const clock = { nowMs: () => 0 };
  const site = { ...deps, pagesHtmlStore: (scope: { workspaceId: string; postId: string }) => new InMemoryPagesHtmlDocumentStore(scope, { repo, clock }) };
  const registrations = withContentTargets({ deps: site, registrations: buildPagesRegistrations(site) });
  const registration = registrations.find(tool => tool.descriptor.id === "pages_write_html")!;
  const html = '<main data-agent-element="home">Updated</main>';
  const result = await executeRegisteredTool({ registration, input: { id: "/", html, expectedVersion: barePost.version } });
  assert.equal(result.status, "completed");
  assert.equal((await repo.findById({ workspaceId: "w", id: barePost.id }))!.bodyHtml, html);
  const stale = await executeRegisteredTool({ registration, input: { slug: "/", html, expectedVersion: barePost.version } });
  assert.notEqual(stale.status, "completed");
  assert.match(stale.error!, /VERSION_CONFLICT|version|changed/i);
  // Pages returns a kind mismatch as a model-facing reason, not a thrown error.
  const wrongKind = await executeRegisteredTool({ registration, input: { slug: "news", html } });
  const refused = wrongKind.output as { written: boolean; reason: string };
  assert.equal(refused.written, false);
  assert.match(refused.reason, /^'ordinary-post' is a post, not a page/);
  assert.equal((await repo.findById({ workspaceId: "w", id: "ordinary-post" }))!.bodyHtml, barePost.bodyHtml);
});

test("combined media deletion plans resolve all slugs after admission and preserve one plan", async () => {
  const { deps } = bareDeps();
  const mediaRepo = new InMemoryMediaRepo({});
  await mediaRepo.save(mediaRecord({ id: "asset-1", slug: "dashboard" }));
  await mediaRepo.save(mediaRecord({ id: "asset-2", slug: "logo" }));
  const definition = permanentDeleteAgentToolCatalog.find(tool => tool.name === "media_purge_asset")!;
  let admitted = false, plans = 0, reads = 0;
  const findById = mediaRepo.findById.bind(mediaRepo);
  mediaRepo.findById = async input => { reads++; assert.ok(admitted, "admission must precede lookup"); return findById(input); };
  const [adapted] = withContentTargets({ deps: { ...deps, mediaRepo }, beforeLookup: async () => {
    if (!admitted) throw new Error("deletion not admitted");
  }, registrations: [{ descriptor: { id: definition.name, inputSchema: definition.inputSchema, sideEffects: "deletes-durable-state" },
    policy: { authorize: () => "allow" }, handler: async ctx => { plans++; return ctx.input; } }] });
  const registration = withBatchInput({ registration: adapted!, tool: { toolId: definition.name } }, { mode: "plan" });
  const input = { items: [{ mediaId: "dashboard" }, { slug: "logo" }] };
  assert.notEqual((await executeRegisteredTool({ registration, input })).status, "completed");
  assert.equal(reads, 0);
  assert.equal(plans, 0);
  admitted = true;
  const result = await executeRegisteredTool({ registration, input });
  assert.equal(result.status, "completed");
  assert.deepEqual((result.output as { items: unknown[] }).items, [{ mediaId: "asset-1" }, { mediaId: "asset-2" }]);
  assert.equal(plans, 1, "target preparation must not execute separate per-item plans");
  assert.deepEqual(input, { items: [{ mediaId: "dashboard" }, { slug: "logo" }] });
});

// L11 Stryker: the id-prefix → entity-type routing (`seo_`, `pages_`, `content_post_`, `media_`,
// `library_read`, the content_read.* cards) and the slug-alias rules survived. Drive the adapter
// directly with recording DI fakes so each row proves WHICH resolver ran and WHICH entity type
// was authorized.
import { applyContentTargetInputs, type ContentTargetDeps } from "../content-target-inputs.js";
import type { ToolRegistration } from "@jini-ai/core";

function recordingDeps(overrides: Partial<ContentTargetDeps> = {}) {
  const log: string[] = [];
  const deps: ContentTargetDeps = {
    workspaceId: "w",
    authorize: (async (input: { permission: string; entityType: string }) => { log.push(`auth:${input.permission}:${input.entityType}`); return { allowed: true, reason: "test" }; }) as never,
    mediaRepo: {
      findById: async ({ id }: { id: string }) => { log.push(`media-id:${id}`); return id === "asset-1" ? mediaRecord({ id: "asset-1", slug: "logo" }) : null; },
      findBySlug: async ({ slug }: { slug: string }) => { log.push(`media-slug:${slug}`); return slug === "logo" ? mediaRecord({ id: "asset-1", slug: "logo" }) : null; },
    } as never,
    resolvePost: async ({ selector }) => { log.push(`post:${selector}`); return `post-id-for-${selector}`; },
    permissionFor: ({ toolId }) => `perm.${toolId}`,
    ...overrides,
  };
  return { deps, log };
}
function synthetic(id: string, properties: Record<string, unknown>, sink: { input?: unknown }): ToolRegistration {
  return { descriptor: { id, inputSchema: { type: "object", properties }, sideEffects: "none" },
    policy: { authorize: () => "allow" }, handler: async ctx => { sink.input = ctx.input; return {}; } };
}

for (const [toolId, kind, authEntity] of [
  ["seo_analyze_entry", "post", "seo-entry"], ["content_read.seo_entry_meta", "post", "seo-entry"],
  ["pages_update", "post", "post"], ["content_post_read", "post", "post"], ["content_read.content_post", "post", "post"],
  ["media_update_metadata", "media", "media"], ["content_read.media_asset", "media", "media"], ["library_read", "media", "media"],
] as const) {
  test(`${toolId} resolves its id through the ${kind} resolver and authorizes ${authEntity}`, async () => {
    const { deps, log } = recordingDeps();
    const sink: { input?: unknown } = {};
    const [registration] = applyContentTargetInputs({ registrations: [synthetic(toolId, { id: {} }, sink)], deps });
    const selector = kind === "post" ? "hello" : "logo";
    assert.equal((await executeRegisteredTool({ registration: registration!, input: { id: selector } })).status, "completed");
    const expectedId = kind === "post" ? "post-id-for-hello" : "asset-1";
    assert.deepEqual(sink.input, { id: expectedId });
    assert.equal(log[0], `auth:perm.${toolId}:${authEntity}`);
    assert.equal(log.some(entry => entry.startsWith(kind === "post" ? "media" : "post:")), false, "the other resolver never runs");
  });
}

test("tools outside the CMS target families, or without a target key, are returned untouched", () => {
  const { deps } = recordingDeps();
  const sink = {};
  for (const registration of [
    synthetic("content_read.other", { id: {} }, sink), synthetic("seo", { id: {} }, sink), synthetic("xmedia_read", { id: {} }, sink),
    synthetic("library_read_all", { id: {} }, sink), synthetic("webhooks_get", { id: {} }, sink), synthetic("media_update_metadata", { name: {} }, sink),
  ]) {
    assert.equal(applyContentTargetInputs({ registrations: [registration], deps })[0], registration, registration.descriptor.id);
  }
});

test("each target key is recognised, in its priority order", async () => {
  for (const key of ["id", "mediaId", "postId", "documentId", "entryId"]) {
    const { deps } = recordingDeps();
    const sink: { input?: unknown } = {};
    const [registration] = applyContentTargetInputs({ registrations: [synthetic("content_post_read", { [key]: {} }, sink)], deps });
    assert.notEqual(registration, undefined);
    await executeRegisteredTool({ registration: registration!, input: { [key]: "hello" } });
    assert.deepEqual(sink.input, { [key]: "post-id-for-hello" }, key);
  }
  const { deps } = recordingDeps();
  const sink: { input?: unknown } = {};
  const [both] = applyContentTargetInputs({ registrations: [synthetic("content_post_read", { postId: {}, id: {} }, sink)], deps });
  await executeRegisteredTool({ registration: both!, input: { id: "hello", postId: "untouched" } });
  assert.deepEqual(sink.input, { id: "post-id-for-hello", postId: "untouched" }, "id wins over postId");
});

test("slug is a target alias unless the schema writes a slug — except pages_ and media_view_ tools", async () => {
  for (const [toolId, properties, input, expected] of [
    ["content_post_read", { id: {} }, { slug: "hello" }, { id: "post-id-for-hello" }],
    ["content_post_update", { id: {}, slug: {} }, { id: "hello", slug: "new" }, { id: "post-id-for-hello", slug: "new" }],
    ["pages_update", { id: {}, slug: {} }, { slug: "hello" }, { id: "post-id-for-hello" }],
    ["media_view_image", { mediaId: {}, slug: {} }, { slug: "logo" }, { mediaId: "asset-1" }],
  ] as const) {
    const { deps } = recordingDeps();
    const sink: { input?: unknown } = {};
    const [registration] = applyContentTargetInputs({ registrations: [synthetic(toolId, properties, sink)], deps });
    const result = await executeRegisteredTool({ registration: registration!, input });
    assert.equal(result.status, "completed", `${toolId}: ${result.error}`);
    assert.deepEqual(sink.input, expected, toolId);
  }
});

test("a second selector beside the alias is refused naming both keys; a missing target passes through", async () => {
  const { deps, log } = recordingDeps();
  const sink: { input?: unknown } = {};
  const [registration] = applyContentTargetInputs({ registrations: [synthetic("content_post_read", { id: {} }, sink)], deps });
  const conflict = await executeRegisteredTool({ registration: registration!, input: { id: "a", slug: "b" } });
  assert.equal(conflict.status, "failed");
  assert.match(conflict.error!, /content_post_read: send exactly one of id or slug\./);
  assert.deepEqual(await executeRegisteredTool({ registration: registration!, input: { other: 1 } }).then(r => r.status), "completed");
  assert.deepEqual(sink.input, { other: 1 });
  assert.deepEqual(log, [], "no selector means no authorization lookup and no resolver read");
});

test("a media selector owned by another workspace is passed through unresolved", async () => {
  const { deps } = recordingDeps({ mediaRepo: { findById: async () => mediaRecord({ id: "x", slug: "logo", workspaceId: "other" }), findBySlug: async () => null } as never });
  const sink: { input?: unknown } = {};
  const [registration] = applyContentTargetInputs({ registrations: [synthetic("media_update_metadata", { mediaId: {} }, sink)], deps });
  await executeRegisteredTool({ registration: registration!, input: { mediaId: "x" } });
  assert.deepEqual(sink.input, { mediaId: "x" });
});

test("batched items are prepared one by one; more than the batch cap is refused before any lookup", async () => {
  const { deps, log } = recordingDeps();
  const sink: { input?: unknown } = {};
  const [registration] = applyContentTargetInputs({ registrations: [synthetic("content_post_read", { id: {}, items: {} }, sink)], deps });
  await executeRegisteredTool({ registration: registration!, input: { items: [{ id: "a" }, { id: "b" }, { id: "c" }] } });
  assert.deepEqual(sink.input, { items: [{ id: "post-id-for-a" }, { id: "post-id-for-b" }, { id: "post-id-for-c" }] });
  log.length = 0;
  const tooMany = await executeRegisteredTool({ registration: registration!, input: { items: Array.from({ length: 26 }, (_, i) => ({ id: `p${i}` })) } });
  assert.equal(tooMany.status, "failed");
  assert.match(tooMany.error!, /At most 25 targets can be prepared in one call\./);
  assert.deepEqual(log, []);
});

test("permanent-delete tools run beforeLookup with the tool and principal before the permission check", async () => {
  const order: string[] = [];
  const { deps, log } = recordingDeps({ beforeLookup: async ({ toolId, principalId }) => { order.push(`before:${toolId}:${principalId}`); } });
  const sink: { input?: unknown } = {};
  const [registration] = applyContentTargetInputs({ registrations: [synthetic("media_purge_asset", { mediaId: {} }, sink)], deps });
  await executeRegisteredTool({ registration: registration!, input: { mediaId: "asset-1" } });
  assert.deepEqual(order, ["before:media_purge_asset:caller"]);
  assert.equal(log[0], "auth:perm.media_purge_asset:media");
  const plain = recordingDeps({ beforeLookup: async () => { order.push("unexpected"); } });
  const [update] = applyContentTargetInputs({ registrations: [synthetic("media_update_metadata", { mediaId: {} }, sink)], deps: plain.deps });
  await executeRegisteredTool({ registration: update!, input: { mediaId: "asset-1" } });
  assert.deepEqual(order, ["before:media_purge_asset:caller"], "an ordinary tool never runs beforeLookup");
});
