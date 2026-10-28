import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWidgetInstanceFieldsJson, resolvePageWidgets, InMemoryWidgetRegionBindingRepo } from '@jini-ai/cms/widgets';
import { registerCoreResolver, createGalleryWidgetResolver } from '@jini-ai/cms/widgets/resolvers';
import { resolveHtmlPageEmbeds, resolveGalleryWidgetMedia } from '@jini-ai/cms/widgets/html';
import { InMemoryEntryRepo } from '#src/features/entries/index';
import { InMemoryMediaRepo, InMemoryTransformDefinitionRepo, CORE_PUBLIC_TRANSFORM_NAME } from '#src/features/media/index';
import { buildWidgetHostPorts } from '#src/features/widgets/deps';
import { renderDocNode, renderWidgetIr, renderHtmlPageBody } from '#src/server/inbound/public-http/http/site/render';
import { extractEntryRefs } from '#src/contracts/core/entry-refs/extractor';
import { widgetsAgentToolCatalog } from '#src/features/widgets/agent-tools';

const workspaceId = 'gallery-widget-workspace', now = '2026-10-09T00:00:00.000Z';
const config = { images: [{ mediaId: 'one', alt: 'Author alt', caption: 'Caption' }], layout: 'carousel', columns: 3, aspectRatio: '16/9' };
test('Gallery in a TipTap post uses the HTML gallery renderer and preserves data-kui while stripping onclick/script URLs', async () => {
  const entryRepo = new InMemoryEntryRepo(), mediaRepo = new InMemoryMediaRepo({}), transformRepo = new InMemoryTransformDefinitionRepo({});
  await entryRepo.save({ id: 'gallery-widget', workspaceId, type: 'widget', slug: 'gallery', title: 'Gallery', status: 'draft', bodyJson: null, fieldsJson: buildWidgetInstanceFieldsJson({ payload: { widgetType: 'gallery', status: 'active', config } }), publishedAt: null, createdAt: now, updatedAt: now, version: 1 });
  await mediaRepo.save({ id: 'one', workspaceId, slug: 'photo-one', title: 'One', alt: 'Stored', caption: '', credit: '', source: { sha256: 'a'.repeat(64) }, status: 'active', createdAt: now, updatedAt: now, version: 1, width: 1200, height: 800, cssClass: null, htmlAttributes: null });
  await transformRepo.insert({ id: 'public', workspaceId, name: CORE_PUBLIC_TRANSFORM_NAME, version: 1, params: { format: 'webp' }, owner: 'core', createdAt: now });
  const deps = { host: buildWidgetHostPorts({}), entryRepo, mediaRepo, transformRepo };
  registerCoreResolver({ typeKey: 'gallery', resolver: createGalleryWidgetResolver({ resolveMedia: ({ refs, context }) => resolveGalleryWidgetMedia({ refs, context, deps }) }) });
  const node = { type: 'widgetEmbed', attrs: { placementId: 'p', widgetEntryId: 'gallery-widget', htmlAttributes: 'data-kui="carousel target photos" onclick="alert(1)" poster="javascript:alert(1)"' } };
  const widgets = await resolvePageWidgets({ deps: { entryRepo, bindingRepo: new InMemoryWidgetRegionBindingRepo() }, input: { workspaceId, pageBodyJson: { type: 'doc', content: [node] }, resolvedRegions: [] } });
  const ir = widgets.inlineResolved.get('p'); assert.ok(ir); assert.equal(ir.componentId, 'gallery');
  const html = `<div data-embed-config='${JSON.stringify({ type: 'gallery', ...config })}'></div>`;
  const embeds = await resolveHtmlPageEmbeds({ deps, input: { workspaceId, html } });
  assert.equal(renderWidgetIr(ir), renderHtmlPageBody(html, embeds));
  const rendered = renderDocNode(node, widgets.inlineResolved);
  assert.ok(rendered.includes('data-kui="carousel target photos"')); assert.ok(rendered.includes('/m/photo-one/public.v1/image.jpg?v=aaaaaaaaaaaa'));
  assert.ok(!rendered.includes('onclick')); assert.ok(!rendered.includes('javascript:'));
});

test('Gallery widget media refs retain order and duplicate occurrences, protecting assets even with invalid layout', () => {
  const refs = extractEntryRefs({ workspaceId, sourceEntryId: 'gallery-widget', sourceEntryType: 'widget', bodyJson: null, fieldsExt: { widget: { widgetType: 'gallery', config: { images: [{ mediaId: 'one' }, { mediaId: 'two' }, { mediaId: 'one' }], layout: 'invalid' } } } });
  assert.deepEqual(refs.map(ref => [ref.targetKind, ref.targetId]), [['asset', 'one'], ['asset', 'two'], ['asset', 'one']]);
  assert.equal(new Set(refs.map(ref => ref.fieldPath)).size, 3);
});

test('assistant create/update schemas advertise Media and retain Gallery compatibility', () => {
  const create = widgetsAgentToolCatalog.find(tool => tool.name === 'widgets_create_instance')!;
  const properties = create.inputSchema!.properties as Record<string, { enum?: string[]; description?: string }>;
  assert.ok(properties.widgetType.enum?.includes('media'));
  assert.ok(properties.widgetType.enum?.includes('gallery'));
  assert.ok(properties.config.description?.includes('mediaId')); assert.ok(properties.config.description?.includes('carousel'));
  const update = widgetsAgentToolCatalog.find(tool => tool.name === 'widgets_update_instance')!;
  for (const tool of [create, update]) {
    const configSchema = (tool.inputSchema!.properties as Record<string, { description: string }>).config;
    assert.ok(configSchema.description.includes('Legacy Gallery images/mediaId still read.'));
    assert.ok(configSchema.description.includes('mode:media'));
    assert.ok(configSchema.description.includes('mode:html'));
    assert.ok(configSchema.description.includes('slug'));
  }
});
