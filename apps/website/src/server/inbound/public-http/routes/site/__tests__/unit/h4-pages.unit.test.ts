import assert from 'node:assert/strict';
import test from 'node:test';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import type { RouteDeps } from '#src/server/routes/types';
import type { DiscoveredTheme, StaticMenuItem } from '#src/features/theme/index';
import { NAV_DOC_TYPE, type NavMenuEntry } from '#src/features/navigation/index';
import type { PublicPostRecord } from '#src/features/post/index';
import { resolveSiteAssistantWidgetForRequest, resolveStaticMenusForRender, resolveMediaAssetMetadataForRender, type TemplateRenderDeps, type RenderContextResolutionDeps } from '../../pages.js';

test('static export suppresses the assistant before consulting settings or credentials', async () => {
  assert.equal(await resolveSiteAssistantWidgetForRequest({ request: { header: name => {
    assert.equal(name, 'x-tovu-static-export'); return '1';
  } }, deps: portFake<RouteDeps>({}) }), false);
});

test('docs pager crosses group boundaries and preserves both neighbours authored classes', async () => {
  const item = (id: string, label: string, href: string, cssClass: string) => ({ id, label, target: { kind: 'url' as const, href }, attrs: { cssClass } });
  const menu: NavMenuEntry = { id: 'menu-header-nav', workspaceId: 'ws', slug: 'header-nav', title: 'Header', status: 'published',
    locations: [], version: 1, updatedAt: '2026-10-28T00:00:00.000Z', doc: { type: NAV_DOC_TYPE, version: 1, items: [
      { id: 'docs', label: 'Docs', target: { kind: 'url', href: '/docs' }, children: [
        { id: 'group-a', label: 'Basics', target: { kind: 'url', href: '/docs#basics' }, children: [item('first', 'First', '/first', 'first-class'), item('middle', 'Middle', '/middle', 'middle-class')] },
        { id: 'group-b', label: 'Advanced', target: { kind: 'url', href: '/docs#advanced' }, children: [item('last', 'Last', '/last', 'last-class')] },
      ] },
    ] } };
  const theme = portFake<DiscoveredTheme>({ manifest: { id: 'fixture', tier: 'static' }, pages: {}, partials: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {} });
  const deps = portFake<TemplateRenderDeps>({ workspaceId: 'ws',
    navLocationBindingRepo: { findByLocation: async () => null },
    menuRepo: { findBySlug: async () => null, findById: async ({ id }: { id: string }) => id === 'menu-header-nav' ? menu : null },
  });
  const menus = await resolveStaticMenusForRender(deps, theme, '/middle', ['docs-prev-next']);
  const neighbours = menus['docs-prev-next'] as readonly StaticMenuItem[];
  assert.ok(Array.isArray(neighbours));
  assert.deepEqual(neighbours.map(({ label, href, attrs, children, isCurrent, isActive }) => ({ label, href, cssClass: attrs?.cssClass, children, isCurrent, isActive })), [
    { label: 'First', href: '/first', cssClass: 'docs-pager-prev first-class', children: [], isCurrent: false, isActive: false },
    { label: 'Last', href: '/last', cssClass: 'docs-pager-next last-class', children: [], isCurrent: false, isActive: false },
  ]);
});

test('media metadata batches only live distinct assets and retains a missing content type as null', async () => {
  const reads: unknown[] = [];
  const deps = portFake<RenderContextResolutionDeps>({ workspaceId: 'ws',
    mediaRepo: { findById: async ({ id }: { id: string }) => {
      if (id === 'missing') return null;
      return { id, status: id === 'trashed' ? 'trashed' : 'active', slug: `${id}-slug`, source: { sha256: `${id}-sha` }, width: 320, height: 200, cssClass: 'cover', htmlAttributes: null };
    }, findBySlug: async () => null },
    mediaContentTypeStore: { getMany: async (input: unknown) => { reads.push(input); return new Map([['first-sha', 'image/png']]); } },
  });
  const post = portFake<PublicPostRecord>({ id: 'post', bodyFormat: 'doc', bodyJson: { type: 'doc', content: [
    { type: 'image', attrs: { assetId: 'first' } }, { type: 'media', attrs: { assetId: 'second' } },
    { type: 'image', attrs: { assetId: 'first' } }, { type: 'media', attrs: { assetId: 'missing' } },
    { type: 'media', attrs: { assetId: 'trashed' } },
  ] } });
  const result = await resolveMediaAssetMetadataForRender(deps, post);
  assert.deepEqual(reads, [{ workspaceId: 'ws', sha256s: ['first-sha', 'second-sha'] }]);
  assert.deepEqual([...result], [
    ['first', { width: 320, height: 200, cssClass: 'cover', htmlAttributes: null, slug: 'first-slug', sha256: 'first-sha', contentType: 'image/png' }],
    ['second', { width: 320, height: 200, cssClass: 'cover', htmlAttributes: null, slug: 'second-slug', sha256: 'second-sha', contentType: null }],
  ]);
});
