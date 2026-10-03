/** t08: preview tool auth, passthrough, output projection and real rendering. */
import assert from "node:assert/strict";
import test from "node:test";
import { buildPostPreviewRegistrations, postPreviewDerivedRisk } from "../preview-tool.js";
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
  assert.deepEqual(result, { postId: 'draft-1', title: 'Draft title', status: 'draft', templateChoice: 'other.html', matches: [{ offset: 0, snippet: 'Needle & Pending' }], matchCount: 1, bodyBytes: 16, truncated: false });
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
    [{ postId: '' }, 'content_post_preview: postId must be a non-empty id or slug.'],
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
    postId: 'draft-1', title: 'Draft title', status: 'draft', templateChoice: '', body: 'Hello', bodyBytes: 5, truncated: true,
  });
  assert.deepEqual(received, [{ post: barePost, templateChoice: '', bodyHtml: '' }]);
  assert.equal(writes(), 0);
});
test("tool uses the REAL extracted renderer for an unsaved bare-page draft", async () => {
  const { deps, repo, writes } = bareDeps();
  const registration = buildPostPreviewRegistrations(deps, { renderPostPreview })[0]!;
  const html = '<!doctype html><html><body><p>New text</p></body></html>';
  assert.deepEqual(await registration.handler(context({ postId: 'draft-slug', bodyHtml: html })), { postId: 'draft-1', title: 'Draft title', status: 'draft', templateChoice: '', bodyBytes: Buffer.byteLength(html), truncated: false, body: html });
  assert.equal(writes(), 0); assert.deepEqual(await repo.findById({ workspaceId: 'w', id: 'draft-1' }), barePost);
});
