/** t08: preview tool auth, passthrough, output projection and real rendering. */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { buildPostPreviewRegistrations, contributePostPreviewTools, postPreviewAgentToolCatalog, postPreviewDerivedRisk } from "../preview-tool.js";
import { ToolInputError } from "@jini-ai/core";
import { InMemoryPresentationSettingsRepo } from "../../presentation/index.js";
import { bareDeps, barePost } from "#src/server/inbound/admin-http/routes/posts/__tests__/preview-fixtures";
import { renderPostPreview } from "#src/server/inbound/admin-http/routes/posts/template-preview-render";
function context(input: unknown) { return { principal: { id: 'p' }, input, signal: new AbortController().signal } as never; }
test("preview passes unsaved fields, shapes the page and is readOnly with no repo writes", async () => {
  const { deps, repo, writes } = bareDeps();
  const bodyJson = { type: 'doc', content: [] }; let received: unknown;
  const registration = buildPostPreviewRegistrations(deps, { renderPostPreview: async (_deps, input) => { received = input; return { html: '<style>hidden</style><p>Needle &amp; Pending</p>', templateChoice: 'other.html' }; } })[0]!;
  assert.equal(registration.descriptor.readOnly, true); assert.equal(postPreviewDerivedRisk.get('content_post_preview'), 'none');
  const result = await registration.handler(context({ postId: 'draft-slug', templateChoice: 'other.html', bodyJson, bodyHtml: '<p>pending</p>', find: 'needle', textOnly: true }));
  assert.deepEqual(received, { post: barePost, templateChoice: 'other.html', bodyJson, bodyHtml: '<p>pending</p>' });
  assert.deepEqual(result, { postId: 'draft-1', title: 'Draft title', status: 'draft', templateChoice: 'other.html', availableTemplates: [], matches: [{ offset: 0, snippet: 'Needle & Pending' }], matchCount: 1, bodyBytes: 16, truncated: false });
  assert.equal(writes(), 0); assert.deepEqual(await repo.findById({ workspaceId: 'w', id: 'draft-1' }), barePost);
});
test("permission denied prevents lookup and rendering", async () => {
  let calls = 0;
  const registration = buildPostPreviewRegistrations({ workspaceId: 'w', authorize: async () => ({ allowed: false, reason: 'denied' }), postRepo: { findById: async () => { calls++; return barePost; }, findBySlug: async () => { calls++; return barePost; } } } as never, { renderPostPreview: async () => { calls++; return { html: '', templateChoice: '' }; } })[0]!;
  await assert.rejects(registration.handler(context({ postId: 'draft-1' })), { message: "principal 'p' is not authorized for 'content.read' (denied)" }); assert.equal(calls, 0);
});
test("unknown posts and invalid optional inputs are actionable refusals", async () => {
  const { deps } = bareDeps();
  const registration = buildPostPreviewRegistrations(deps, { renderPostPreview })[0]!;
  await assert.rejects(registration.handler(context({ postId: 'missing' })), { message: "content_post_preview: no post or page with id or slug 'missing'. Use content_read.content_post to find it." });
  for (const [input, message] of [
    [{ postId: '' }, 'content_post_preview: id must be a non-empty id or slug (postId is a legacy alias).'],
    [{ postId: 'draft-1', bodyJson: [] }, 'content_post_preview: bodyJson must be a JSON object.'],
    [{ postId: 'draft-1', bodyHtml: 2 }, 'content_post_preview: bodyHtml must be a string.'],
    [{ postId: 'draft-1', templateChoice: 3 }, 'content_post_preview: templateChoice must be a string.'],
    [{ postId: 'draft-1', find: '' }, 'find must be a string of 1..200 characters.'],
    [{ postId: 'draft-1', textOnly: 1 }, 'textOnly must be a boolean.'],
    [{ postId: 'draft-1', maxBytes: 1000001 }, 'maxBytes must be an integer of 1..1000000.'],
  ] as const) await assert.rejects(registration.handler(context(input)), { message });
});
test("preview body output strips before capping and preserves explicit empty unsaved fields", async () => {
  const { deps, writes } = bareDeps();
  const received: unknown[] = [];
  const registration = buildPostPreviewRegistrations(deps, { renderPostPreview: async (_deps, input) => {
    received.push(input);
    return { html: '<script>' + 'hidden'.repeat(100) + '</script><p>Hello there</p>', templateChoice: '' };
  } })[0]!;
  assert.deepEqual(await registration.handler(context({ postId: 'draft-1', templateChoice: '', bodyHtml: '', textOnly: true, maxBytes: 5 })), {
    postId: 'draft-1', title: 'Draft title', status: 'draft', templateChoice: '', availableTemplates: [], body: 'Hello', bodyBytes: 5, truncated: true,
  });
  assert.deepEqual(received, [{ post: barePost, templateChoice: '', bodyHtml: '' }]);
  assert.equal(writes(), 0);
});
test("tool uses the REAL extracted renderer for an unsaved bare-page draft", async () => {
  const { deps, repo, writes } = bareDeps();
  const registration = buildPostPreviewRegistrations(deps, { renderPostPreview })[0]!;
  const html = '<!doctype html><html><body><p>New text</p></body></html>';
  assert.deepEqual(await registration.handler(context({ postId: 'draft-slug', bodyHtml: html })), { postId: 'draft-1', title: 'Draft title', status: 'draft', templateChoice: '', availableTemplates: [], bodyBytes: Buffer.byteLength(html), truncated: false, body: html });
  assert.equal(writes(), 0); assert.deepEqual(await repo.findById({ workspaceId: 'w', id: 'draft-1' }), barePost);
});

test("preview accepts id or legacy postId; id takes precedence and invalid id never falls back", async () => {
  const { deps, writes } = bareDeps();
  const registration = buildPostPreviewRegistrations(deps, { renderPostPreview })[0]!;
  const expected = await registration.handler(context({ postId: "draft-slug", find: "<p>" }));
  assert.deepEqual(await registration.handler(context({ id: "draft-1", find: "<p>" })), expected);
  assert.deepEqual(await registration.handler(context({ id: "draft-slug", postId: "missing", find: "<p>" })), expected);
  for (const id of ["", "  ", null, 123]) {
    await assert.rejects(registration.handler(context({ id, postId: "draft-1" })), error => error instanceof ToolInputError && /id must be a non-empty id or slug/.test(error.message));
  }
  assert.deepEqual(postPreviewAgentToolCatalog[0]!.inputSchema.anyOf, [{ required: ["id"] }, { required: ["postId"] }]);
  assert.equal(writes(), 0);
});

test("preview exposes the active theme's page templates using the admin applicability rule", async () => {
  const { deps } = bareDeps();
  deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: "w", activeThemeId: "chosen", updatedAt: "2026-10-01T00:00:00Z" }] });
  deps.themes.push({ status: "valid", manifest: { id: "chosen", templates: ["post.html", "page.html", "shared.html"], templateFor: { "post.html": ["post"], "page.html": ["page"] } } } as never);
  const registration = buildPostPreviewRegistrations(deps, { renderPostPreview })[0]!;
  const result = await registration.handler(context({ id: "draft-1" })) as { availableTemplates: string[] };
  assert.deepEqual(result.availableTemplates, ["page.html", "shared.html"]);
});

test("L156 preview rejects every malformed override before authorization and keeps omitted keys absent", async () => {
  const { deps } = bareDeps();
  let reads = 0;
  const registration = buildPostPreviewRegistrations({ ...deps, authorize: async () => {
    reads++; return { allowed: true, reason: "test" };
  } }, { renderPostPreview: async (_deps, input) => {
    assert.deepEqual(Object.keys(input), ["post"]);
    return { html: "", templateChoice: null };
  } })[0]!;
  for (const bodyJson of [null, [], "text", 0, false]) {
    await assert.rejects(registration.handler(context({ id: "draft-1", bodyJson })),
      { message: "content_post_preview: bodyJson must be a JSON object." });
  }
  for (const key of ["bodyHtml", "templateChoice"]) {
    await assert.rejects(registration.handler(context({ id: "draft-1", [key]: null })),
      { message: `content_post_preview: ${key} must be a string.` });
  }
  assert.equal(reads, 0);
  await registration.handler(context({ id: "draft-1" }));
  assert.equal(reads, 1);
});
test("a repository failure other than not-found propagates unchanged rather than being reworded as a missing post", async () => {
  const outage = new Error("post store unavailable");
  const registration = buildPostPreviewRegistrations({ workspaceId: 'w', authorize: async () => ({ allowed: true, reason: 'matched' }), postRepo: { findById: async () => { throw outage; }, findBySlug: async () => { throw outage; } } } as never, { renderPostPreview })[0]!;
  await assert.rejects(registration.handler(context({ postId: 'draft-1' })), (error: unknown) => error === outage);
});
test("the preview contributor builds the same read-only preview tool with the renderer it was given", async () => {
  const { deps } = bareDeps();
  let rendered = 0;
  const contributor = contributePostPreviewTools({ renderPostPreview: async () => { rendered++; return { html: '<p>From contributor</p>', templateChoice: '' }; } });
  assert.equal(contributor.domain, 'post-preview'); assert.equal(contributor.risk, postPreviewDerivedRisk);
  const [registration] = contributor.build(deps as never, {} as never);
  assert.equal(registration!.descriptor.id, 'content_post_preview');
  const result = await registration!.handler(context({ postId: 'draft-1' })) as { body: string };
  assert.equal(result.body, '<p>From contributor</p>'); assert.equal(rendered, 1);
});
