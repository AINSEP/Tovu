/** t08: extraction parity through the existing route handler, without binding a port. */
import assert from "node:assert/strict";
import test from "node:test";
import { renderPostPreview } from "../template-preview-render.js";
import { registerAdminPostTemplatePreviewRoute } from "../template-preview.js";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { NO_THEME_ID, type DiscoveredTheme } from "#src/features/theme/index";

import { bareDeps, barePost } from "./preview-fixtures.js";
test("real extracted renderer serves an unpublished bare page and pending body without changing the row", async () => {
  const { deps, repo, writes } = bareDeps();
  const bodyHtml = '<!doctype html><html><body><p>Pending draft</p></body></html>';
  assert.deepEqual(await renderPostPreview(deps, { post: barePost, bodyHtml }), { html: bodyHtml, templateChoice: '' });
  assert.deepEqual(await repo.findById({ workspaceId: 'w', id: 'draft-1' }), barePost);
  assert.equal(writes(), 0);
});
test("extracted rendering is byte-identical to the old route output for the same input", async () => {
  const { deps } = bareDeps();
  let handler: Function | undefined;
  registerAdminPostTemplatePreviewRoute({ get: (_path: string, fn: Function) => { handler = fn; }, post: () => {} } as never, deps);
  let output = ''; let status = 200; const headers: Record<string, string> = {};
  const response = { locals: { principal: { id: 'p' } }, status: (value: number) => { status = value; return response; }, set: (key: string, value: string) => { headers[key] = value; return response; }, type: () => response, send: (value: string) => { output = value; return response; } };
  await handler!({ params: { workspaceId: 'w', postId: 'draft-1' }, query: { templateChoice: '' }, body: {} }, response);
  assert.equal(status, 200); assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(output, '<!doctype html><html><body><p>Saved draft</p></body></html>');
  assert.equal((await renderPostPreview(deps, { post: barePost, templateChoice: '' })).html, output);
});
test("theme rendering keeps draft content, applies pending edits and never changes the saved template or body", async () => {
  const post = { ...barePost, kind: 'post' as const, bodyFormat: 'doc' as const, bodyHtml: null,
    templateChoice: 'saved.html', bodyJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved draft' }] }] } };
  const { deps, repo, writes } = bareDeps([post]);
  const slot = '<div data-embed-config=\'{"type":"content"}\'></div>';
  deps.themes = [{
    manifest: { id: 'preview-theme', name: 'Preview', version: '1.0.0', tier: 'static', engine: 1, templates: ['saved.html', 'pending.html'] },
    dir: '/nonexistent/preview-theme', tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { saved: `<html><body><main data-template="saved">${slot}</main></body></html>`, pending: `<html><body><main data-template="pending">${slot}</main></body></html>` },
    partials: {}, css: '', source: 'site', status: 'valid', errors: [],
  } as unknown as DiscoveredTheme];
  deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: 'w', activeThemeId: 'preview-theme', updatedAt: post.updatedAt }] });
  const pending = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pending edit' }] }] };
  const saved = await renderPostPreview(deps, { post });
  assert.equal(saved.templateChoice, 'saved.html');
  assert.match(saved.html, /data-template="saved"/);
  assert.match(saved.html, /Saved draft/);
  const rendered = await renderPostPreview(deps, { post, templateChoice: 'pending.html', bodyJson: pending, bodyHtml: '<p>Ignored HTML for doc</p>' });
  assert.equal(rendered.templateChoice, 'pending.html');
  assert.match(rendered.html, /data-template="pending"/);
  assert.match(rendered.html, /Pending edit/);
  assert.doesNotMatch(rendered.html, /Saved draft|Ignored HTML for doc/);
  assert.deepEqual(await repo.findById({ workspaceId: 'w', id: post.id }), post);
  assert.deepEqual(pending, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pending edit' }] }] });
  assert.equal(writes(), 0);
});
test("the extracted renderer preserves the route's actionable no-theme error", async () => {
  const { deps } = bareDeps();
  deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: 'w', activeThemeId: NO_THEME_ID, updatedAt: barePost.updatedAt }] });
  await assert.rejects(renderPostPreview(deps, { post: { ...barePost, templateChoice: 'page.html' } }), {
    name: 'TemplatePreviewRenderError', status: 409,
    message: 'this site has no active theme, so there is no template to preview — activate a theme to use the template picker',
  });
});
