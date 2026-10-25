/** t08: extraction parity through the existing route handler, without binding a port. */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { renderPostPreview } from "../template-preview-render.js";
import { registerAdminPostTemplatePreviewRoute } from "../template-preview.js";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { InMemoryTransformDefinitionRepo } from "#src/features/media/index";
import { resolveStaticMenusForRender, renderViaTemplate } from "#src/server/inbound/public-http/routes/site/pages";
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

test("a template preview on a site whose stored active theme resolves to nothing installed is a 500 'no themes installed'", async () => {
  const { deps } = bareDeps();
  deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: 'w', activeThemeId: 'uninstalled-theme', updatedAt: barePost.updatedAt }] });
  await assert.rejects(renderPostPreview(deps, { post: { ...barePost, templateChoice: 'page.html' } }), {
    name: 'TemplatePreviewRenderError', status: 500, message: 'no themes installed',
  });
});

test("a bare page preview reports its template choice as the empty string it was selected by", async () => {
  const { deps } = bareDeps();
  const result = await renderPostPreview(deps, { post: barePost, bodyHtml: '<p>Pending</p>' });
  assert.equal(result.templateChoice, '');
  assert.match(result.html, /Pending/);
});

test("postpolish: public static render and editor preview share saved cover choice with a pending body", async () => {
  const assetId = "44444444-4444-4444-4444-444444444444";
  const image = (alt: string) => ({ type: "image", attrs: { assetId, transformName: "public", alt } });
  const bodyJson = { type: "doc", content: [image("Saved cover"), image("Later image")] };
  const post = { ...barePost, kind: "post" as const, status: "published" as const, bodyFormat: "doc" as const,
    bodyHtml: null, templateChoice: "article.html", bodyJson };
  const { deps, repo, writes } = bareDeps([post]);
  await deps.mediaRepo.save({ id: assetId, workspaceId: "w", title: "Cover", slug: "cover", alt: "", caption: "", credit: "",
    source: { sha256: "cover-sha" }, status: "active", version: 1, createdAt: post.updatedAt, updatedAt: post.updatedAt,
    width: 100, height: 100, cssClass: null, htmlAttributes: null });
  await deps.mediaContentTypeStore.set({ workspaceId: "w", sha256: "cover-sha", contentType: "image/jpeg" });
  deps.transformDefinitionRepo = new InMemoryTransformDefinitionRepo({}, { initialRows: [
    { id: "public-transform", workspaceId: "w", name: "public", version: 1, params: { format: "jpeg" }, owner: "core", createdAt: post.updatedAt },
  ] });
  const theme = { manifest: { id: "cover-theme", name: "Cover", version: "1", tier: "static", engine: 1, templates: ["article.html"] },
    dir: "/unused", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { article: `<html><body><figure data-embed-config='{"type":"featured-image"}'></figure><main data-embed-config='{"type":"content"}'></main></body></html>` },
    partials: {}, css: "", source: "site", status: "valid", errors: [],
  } as unknown as DiscoveredTheme;
  deps.themes = [theme];
  deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: "w", activeThemeId: "cover-theme", updatedAt: post.updatedAt }] });
  for (const variant of [post, { ...post, ext: { "post-presentation": { hideCoverImageInBody: false } } }, { ...post, featuredMediaId: assetId }]) {
    await repo.save(variant);
    const publicHtml = await renderViaTemplate(deps, theme, variant, undefined);
    const preview = await renderPostPreview(deps, { post: variant });
    assert.equal(preview.html, publicHtml);
    assert.equal((publicHtml.match(/<img /g) ?? []).length, variant.ext || variant.featuredMediaId ? 3 : 2);
  }
  const pending = { type: "doc", content: [image("Pending cover"), image("Pending repeat")] };
  const preview = await renderPostPreview(deps, { post, bodyJson: pending });
  assert.equal((preview.html.match(/alt="Pending cover"/g) ?? []).length, 1);
  assert.ok(preview.html.includes('alt="Pending repeat"'));
  assert.doesNotMatch(preview.html, /Saved cover/);
  assert.equal(pending.content.length, 2);
  assert.equal(bodyJson.content.length, 2);
  assert.equal(writes(), 3); // Only the three explicit fixture saves; no render writes.
});

test("TW2 themed preview preserves saved and pending bodies across format and publication state", async () => {
  const theme: DiscoveredTheme = {
    manifest: { id: "pin-theme", name: "Pin", version: "1", tier: "static", engine: 1, templates: ["article.html"] },
    dir: "/unused", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { article: `<html><body><main data-embed-config='{"type":"content"}'></main></body></html>` },
    partials: {}, css: "", source: "site", status: "valid", errors: [],
  };
  const savedJson = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Saved body pin" }] }] };
  const pendingJson = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Pending body pin" }] }] };
  const cases = [
    ["doc", "draft", "<p>Saved body pin</p>"], ["doc", "draft", null],
    ["doc", "published", "<p>Saved body pin</p>"], ["doc", "published", null],
    ["html", "draft", "<p>Saved body pin</p>"], ["html", "draft", null],
    ["html", "published", "<p>Saved body pin</p>"], ["html", "published", null],
  ] as const;
  for (const [bodyFormat, status, bodyHtml] of cases) {
    const post = { ...barePost, kind: "post" as const, templateChoice: "article.html", bodyFormat, status, bodyJson: savedJson, bodyHtml };
    const { deps, repo, writes } = bareDeps([post]);
    deps.themes = [theme];
    deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: "w", activeThemeId: "pin-theme", updatedAt: post.updatedAt }] });
    const saved = await renderPostPreview(deps, { post });
    if (bodyFormat === "doc" || bodyHtml !== null) assert.match(saved.html, /Saved body pin/);
    else assert.doesNotMatch(saved.html, /Saved body pin/);
    const pending = await renderPostPreview(deps, { post, bodyJson: pendingJson, bodyHtml: "<p>Pending body pin</p>" });
    assert.match(pending.html, /Pending body pin/);
    assert.doesNotMatch(pending.html, /Saved body pin/);
    const empty = await renderPostPreview(deps, { post, bodyJson: { type: "doc", content: [] }, bodyHtml: "" });
    assert.doesNotMatch(empty.html, /Saved body pin|Pending body pin/);
    assert.equal(empty.templateChoice, "article.html");
    assert.deepEqual(await repo.findById({ workspaceId: "w", id: post.id }), post);
    assert.equal(writes(), 0);
  }
});

/** Captures the route's GET handler and a text/html-capable response (the route answers with
 *  `type().send()`, not `json()`), mirroring the byte-identical test above. */
function previewHandler(deps: ReturnType<typeof bareDeps>["deps"]) {
  let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined;
  registerAdminPostTemplatePreviewRoute({ get: (_path: string, fn: typeof handler) => { handler = fn; }, post: () => {} } as never, deps);
  assert.ok(handler);
  const invoke = async (req: unknown) => {
    const out = { status: 200, text: '' };
    const response = { locals: { principal: { id: 'p' } }, status: (value: number) => { out.status = value; return response; }, set: () => response, type: () => response, send: (value: string) => { out.text = value; return response; } };
    await handler!(req, response);
    return out;
  };
  return invoke;
}

/** Express guarantees matched `:workspaceId`/`:postId` segments, and body-parser always assigns
 *  `req.body`, so these fallbacks are only reachable via a hand-built `req` (extractRouteHandler's
 *  own doc, `src/server/__tests__/helpers/http-test-server.ts`). */
test("route (direct invoke): a missing :workspaceId 404s, a missing :postId is an ordinary post-not-found 404", async () => {
  const invoke = previewHandler(bareDeps().deps);
  assert.deepEqual(await invoke({ params: {}, query: {} }), { status: 404, text: 'workspace was not found' });
  assert.deepEqual(await invoke({ params: { workspaceId: 'w' }, query: {} }), { status: 404, text: "post '' was not found" });
});

test("route (direct invoke): a request with no body at all renders the saved body (no pending override), never a crash", async () => {
  const invoke = previewHandler(bareDeps().deps);
  const out = await invoke({ params: { workspaceId: 'w', postId: 'draft-1' }, query: { templateChoice: '' } });
  assert.equal(out.status, 200);
  assert.equal(out.text, '<!doctype html><html><body><p>Saved draft</p></body></html>');
});

test("route (direct invoke): an unexpected repository failure is a plain 500 'preview render failed' that leaks no internals", async () => {
  const { deps } = bareDeps();
  deps.postRepo.findBySlug = async () => {
    throw new Error('sqlite: disk I/O error at /private/path');
  };
  const invoke = previewHandler(deps);
  assert.deepEqual(await invoke({ params: { workspaceId: 'w', postId: 'draft-1' }, query: {}, body: {} }), { status: 500, text: 'preview render failed' });
});

test("assigned menu links match in editor preview and the public template pipeline used by export", async () => {
  const post = { ...barePost, status: "published" as const, templateChoice: "page.html", bodyHtml: "<p>Content</p>" };
  const { deps } = bareDeps([post]);
  const theme = {
    manifest: { id: "bound-menu", name: "Bound menu", version: "1", tier: "static", engine: 1, templates: ["page.html"] },
    dir: "/unused", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { page: `<html><body><nav data-embed-config='{"type":"menu","id":"primary"}'></nav><main data-embed-config='{"type":"content"}'></main></body></html>` },
    partials: {}, css: "", source: "site", status: "valid", errors: [],
  } as unknown as DiscoveredTheme;
  deps.themes = [theme];
  deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: "w", activeThemeId: theme.manifest.id, updatedAt: post.updatedAt }] });
  const { InMemoryMenuRepo, InMemoryNavLocationBindingRepo, NAV_DOC_TYPE } = await import("#src/features/navigation/index");
  deps.menuRepo = new InMemoryMenuRepo({}, { initialRows: [{
    id: "assigned", workspaceId: "w", slug: "different-slug", title: "Assigned", status: "published",
    doc: { type: NAV_DOC_TYPE, version: 1, items: [{ id: "link", label: "Assigned link", target: { kind: "url", href: "/assigned-link" } }] },
    locations: ["primary"], updatedAt: post.updatedAt, version: 1,
  }] });
  deps.navLocationBindingRepo = new InMemoryNavLocationBindingRepo({});
  await deps.navLocationBindingRepo.upsert({ workspaceId: "w", locationKey: "primary", menuId: "assigned", boundAt: post.updatedAt });
  const menus = await resolveStaticMenusForRender(deps, theme, "/draft-slug");
  const publicHtml = await renderViaTemplate(deps, theme, post, menus);
  const preview = await renderPostPreview(deps, { post });
  assert.equal(preview.html, publicHtml);
  assert.match(publicHtml, /href="\/assigned-link"/);
});
