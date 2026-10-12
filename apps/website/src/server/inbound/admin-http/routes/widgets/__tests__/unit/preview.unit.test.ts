import assert from 'node:assert/strict';
import test from 'node:test';
import type { JsonObject } from '@jini-ai/core/primitives';
import express from 'express';
import { InMemoryEntryRepo } from '#src/features/entries/index';
import { InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from '#src/features/media/index';
import { buildWidgetHostPorts } from '#src/features/widgets/deps';
import { InMemoryPresentationSettingsRepo } from '#src/features/presentation/index';
import { buildWidgetInstanceFieldsJson, resolvePageWidgets, InMemoryWidgetRegionBindingRepo } from '@jini-ai/cms/widgets';
import { CORE_RESOLVERS, registerCoreResolver, createGalleryWidgetResolver } from '@jini-ai/cms/widgets/resolvers';
import { resolveGalleryWidgetMedia } from '@jini-ai/cms/widgets/html';
import { renderWidgetIr } from '#src/server/inbound/public-http/http/site/render';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import type { RouteDeps } from '#src/server/routes/types';
import { registerAdminWidgetPreviewRoute, parseWidgetPreviewBody } from '../../preview.js';
import { renderWidgetPreview, type WidgetPreviewDeps } from '../../preview-render.js';
import { renderStaticPartial } from '#src/features/theme/index';
import type { DiscoveredTheme } from '#src/features/theme/index';

const path = '/api/admin/v1/workspaces/:workspaceId/widgets/preview';
const now = '2026-10-11T00:00:00.000Z';
function previewDeps(): WidgetPreviewDeps {
  return { workspaceId: 'ws', themes: [], presentationRepo: new InMemoryPresentationSettingsRepo({}, {
    initialRows: [{ workspaceId: 'ws', activeThemeId: 'none', updatedAt: now }],
  }) };
}
function harness({ allowed = true, render = renderWidgetPreview }: { allowed?: boolean; render?: typeof renderWidgetPreview } = {}) {
  const checks: unknown[] = [];
  const deps = { ...previewDeps(), authorize: async (input: unknown) => { checks.push(input); return { allowed, reason: 'test' }; } };
  const app = express();
  registerAdminWidgetPreviewRoute(app, deps as RouteDeps, { render });
  return { checks, async invoke({ workspaceId = 'ws', authed = true, body = { widgetType: 'text', content: { body: 'Draft' } } }: { workspaceId?: string; authed?: boolean; body?: unknown } = {}) {
    const { res, capture } = createCapturingResponse();
    const headers: Record<string, unknown> = {};
    res.setHeader = (name, value) => { headers[name] = value; return res; };
    if (authed) res.locals.principal = { id: 'reader' };
    await extractRouteHandler(app, 'post', path)({ params: { workspaceId }, body }, res);
    assert.equal(headers['Cache-Control'], 'no-store');
    return capture;
  } };
}

test('auth, workspace and widgets.read gates prevent the render port from being called', async () => {
  let renders = 0;
  const render: typeof renderWidgetPreview = async () => { renders++; return { html: 'fake', document: 'fake document' }; };
  const h = harness({ render });
  assert.deepEqual(await h.invoke({ authed: false }), { statusCode: 401, jsonBody: { error: 'authentication required' } });
  assert.deepEqual(await h.invoke({ workspaceId: 'other' }), { statusCode: 404, jsonBody: { error: 'workspace was not found' } });
  assert.equal(h.checks.length, 0);
  const denied = harness({ allowed: false, render });
  assert.deepEqual(await denied.invoke(), { statusCode: 403, jsonBody: {
    error: "principal 'reader' is not authorized for 'widgets.read' (test)", code: 'FORBIDDEN', details: { permission: 'widgets.read', reason: 'test' },
  } });
  assert.equal(renders, 0);
  assert.deepEqual(await h.invoke(), { statusCode: 200, jsonBody: { html: 'fake', document: 'fake document' } });
  assert.deepEqual(h.checks, [{ principalId: 'reader', permission: 'widgets.read', workspaceId: 'ws', entityType: 'widget' }]);
});

test('rejects malformed and oversized input and uses the registered widget schema', async () => {
  for (const raw of [null, [], {}, { widgetType: 1, content: {} }, { widgetType: 'text', content: [] }, { widgetType: 'text', content: null }, { widgetType: 'text', content: {}, role: 'admin' }, { widgetType: 'x'.repeat(101), content: {} }, { widgetType: 'text', content: { body: 'x'.repeat(131072) } }]) {
    assert.equal(parseWidgetPreviewBody({ raw }), null);
    assert.deepEqual(await harness().invoke({ body: raw }), { statusCode: 400, jsonBody: { error: 'widgetType and content are required', code: 'VALIDATION_ERROR' } });
  }
  const unknown = await harness().invoke({ body: { widgetType: 'unknown', content: {} } });
  assert.deepEqual(unknown, { statusCode: 400, jsonBody: { error: 'widget type is unregistered', code: 'WIDGETS_TYPE_UNREGISTERED', details: { widgetType: 'unknown' } } });
  const invalid = await harness().invoke({ body: { widgetType: 'text', content: { body: 42 } } });
  assert.equal(invalid.statusCode, 400);
  assert.equal((invalid.jsonBody as { code: string }).code, 'WIDGETS_CONFIG_VALIDATION_ERROR');
});

test('unsaved structured media, tokens, sanitizer and missing slugs match the public saved-widget renderer byte for byte', async (t) => {
  const entryRepo = new InMemoryEntryRepo(), mediaRepo = new InMemoryMediaRepo({}), transformRepo = new InMemoryTransformDefinitionRepo({});
  await mediaRepo.save({ id: 'photo-id', workspaceId: 'ws', title: 'Photo', slug: 'photo', alt: 'Stored alt', caption: '', credit: '', source: { sha256: 'a'.repeat(64) }, status: 'active', createdAt: now, updatedAt: now, version: 1, width: 1200, height: 800, cssClass: null, htmlAttributes: null });
  await transformRepo.insert({ id: 'public', workspaceId: 'ws', name: 'public', version: 1, params: { format: 'webp' }, owner: 'core', createdAt: now });
  const mediaDeps = { host: buildWidgetHostPorts({}, {}), entryRepo, mediaRepo, transformRepo };
  const previous = CORE_RESOLVERS.gallery;
  const resolver = createGalleryWidgetResolver({ resolveMedia: ({ refs, context }) => resolveGalleryWidgetMedia({ refs, context, deps: mediaDeps }) });
  registerCoreResolver({ typeKey: 'gallery', resolver });
  t.after(() => { if (previous) registerCoreResolver({ typeKey: 'gallery', resolver: previous }); else delete (CORE_RESOLVERS as Record<string, unknown>).gallery; });
  const configs: JsonObject[] = [
    { mode: 'media', items: [{ slug: 'photo' }, { slug: 'missing' }], layout: 'grid', columns: 2 },
    { mode: 'html', html: '<div data-kui="carousel" onclick="evil()"><img src="{{media:photo}}"><img data-media-slug="missing"><script>evil()</script></div>' },
    { mode: 'media', items: [{ slug: 'missing' }], layout: 'single' },
    { mode: 'html', html: '<img src="{{media:missing}}">' },
  ];
  for (const content of configs) {
    await entryRepo.save({ id: 'saved', workspaceId: 'ws', type: 'widget', slug: 'saved', title: 'Saved', status: 'draft', bodyJson: null, fieldsJson: buildWidgetInstanceFieldsJson({ payload: { widgetType: 'media', status: 'active', config: content } }), publishedAt: null, createdAt: now, updatedAt: now, version: 1 });
    const publicResult = await resolvePageWidgets({ deps: { entryRepo, bindingRepo: new InMemoryWidgetRegionBindingRepo() }, input: { workspaceId: 'ws', resolvedRegions: [], pageBodyJson: { type: 'doc', content: [{ type: 'widgetEmbed', attrs: { placementId: 'p', widgetEntryId: 'saved' } }] } } });
    const response = await harness().invoke({ body: { widgetType: 'media', content } });
    assert.equal(response.statusCode, 200);
    const body = response.jsonBody as { html: string; document: string };
    assert.equal(body.html, renderWidgetIr(publicResult.inlineResolved.get('p')!));
    assert.equal(/missing|onclick|evil\(\)|<script|\{\{media/.test(body.html), false);
    assert.equal(body.document.includes(body.html), true);
  }
  const text = await harness().invoke();
  assert.equal((text.jsonBody as { html: string }).html, renderWidgetIr({ componentId: 'text', props: { body: 'Draft' } }));
  assert.equal((await entryRepo.listByWorkspace({ workspaceId: 'ws' }, { type: 'widget' })).length, 1, 'preview never persists an instance');
});

test('static theme CSS and tokens use the existing partial preview path; other tiers use the public shell', async () => {
  const deps = previewDeps();
  const theme = { manifest: { id: 'test', name: 'Test', tier: 'static', apiVersion: 2 }, tokens: { '--color': 'red' }, tokensLight: {}, pages: {}, partials: {}, css: '.proof{color:red}', layouts: {}, status: 'valid', errors: [], source: 'site', dir: '/unused' } as unknown as DiscoveredTheme;
  deps.themes.push(theme);
  await deps.presentationRepo.save({ workspaceId: 'ws', activeThemeId: 'test', updatedAt: now });
  const input = { widgetType: 'text', content: { body: 'Draft' } };
  const output = await renderWidgetPreview({ deps, input });
  const expected = renderStaticPartial({ theme: { ...theme, partials: { 'widget-preview': output.html } }, partialId: 'widget-preview' });
  assert.equal(output.document, expected);
  assert.equal(output.document.includes('<link rel="stylesheet" href="/theme-assets/test/css/theme.css" />'), true);
  assert.equal(output.document.includes('--color: red'), true);
  theme.manifest.tier = 'declarative';
  const other = await renderWidgetPreview({ deps, input });
  assert.equal(other.document.includes('.proof{color:red}'), true);
  assert.equal(other.document.includes('data-theme="test"'), true);
});

test('resolver failure keeps the public placeholder and unknown server failures keep the short error envelope', async () => {
  const output = await renderWidgetPreview({ deps: previewDeps(), input: { widgetType: 'text', content: { body: 'Draft' } } }, { resolve: async () => new Map() });
  assert.equal(output.html, renderWidgetIr({ componentId: 'widget-placeholder', props: {} }));
  const h = harness({ render: async () => { throw new Error('private detail'); } });
  assert.deepEqual(await h.invoke(), { statusCode: 500, jsonBody: { error: 'internal error' } });
});
