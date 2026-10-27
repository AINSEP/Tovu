/** mediawidget owner brief 2026-10-10/11: host renderer, sanitizer, and publication contracts. */
import type { JsonObject } from "@jini-ai/core/primitives";
import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePageHtml, renderMediaRawHtml } from '#src/features/widgets/media-html';
import { renderWidgetIr } from '#src/server/inbound/public-http/http/site/render';
import { collectReferencedMediaKeys } from '#src/features/publish-content/media-references';
import { collectBodyReferences } from '#src/features/publish-content/content-references';
import { extractEntryRefs, extractHtmlEntryRefs } from '#src/contracts/core/entry-refs/extractor';

const media = { photo: { assetId: 'photo-id', slug: 'photo', alt: 'Library alt', width: 1200, height: 800, transformName: 'public', version: 1 } };
const renderMedia = ({ props }: { props: JsonObject }) => renderWidgetIr({ componentId: 'media-image', props });
test('raw media HTML resolves tokens/metadata, drops missing elements, and shares page sanitizer', () => {
  const html = `<div data-kui="carousel target:'img'" onclick="evil()"><img data-media-slug="photo"><video data-media-slug="photo"></video><img src="{{media:missing}}"><script>alert(1)</script><a href="jav&#x61;script:evil()">link</a><img src="{{media:photo}}"></div>`;
  const output = renderMediaRawHtml({ html, media, renderMedia });
  assert.equal((output.match(/<img/g) ?? []).length, 2);
  assert.ok(!output.includes("<video"));
  assert.ok(output.includes('alt="Library alt"'));
  assert.ok(output.includes('width="1200"'));
  assert.ok(output.includes('srcset="/m/photo/public.v1/image.jpg 1x"'));
  assert.ok(output.includes('data-kui="carousel target:'));
  assert.ok(!/script|onclick|missing|\{\{media/.test(output));
  assert.equal(sanitizePageHtml({ html: output }), output);
});
test('sanitizer decodes attributes and rejects foreign namespaces, event handlers, srcdoc and CSS escapes', () => {
  const output = sanitizePageHtml({ html: `<video controls data-kui="scroll-snap-x" onplay="evil()" poster="javascript:x"></video><svg><foreignObject><img onerror="x"></foreignObject></svg><iframe srcdoc="bad"></iframe><div style="background:u\\72l(javascript:x)" data-ok="yes"></div><style>.safe{color:red}</style><style>@import "evil";</style>` });
  assert.ok(output.includes('controls'));
  assert.ok(output.includes('data-kui'));
  assert.ok(output.includes('data-ok="yes"'));
  assert.ok(output.includes('.safe{color:red}'));
  assert.ok(!output.includes('@import'));
  // Inline SVG icons are allowed (landing carousel buttons); its foreignObject subtree still drops.
  assert.ok(output.includes('<svg></svg>'));
  assert.ok(!/onplay|poster|foreignObject|onerror|<img|iframe|style=/.test(output));
});
test('media structured config renders mixed media and keeps safe attributes with no unknown broken image', () => {
  const html = renderWidgetIr({ componentId: 'media', props: { config: { mode: 'media', items: [{ slug: 'photo' }, { slug: 'missing' }, { slug: 'audio', caption: 'Sound' }], layout: 'carousel', htmlAttributes: 'data-kui="scroll-snap-x" onclick="x"' }, media: { ...media, audio: { assetId: 'audio-id', slug: 'audio', contentType: 'audio/mpeg' } } } });
  assert.equal((html.match(/<img/g) ?? []).length, 1);
  assert.ok(html.includes('<audio'));
  assert.ok(html.includes('/m/audio/original.mp3'));
  assert.ok(html.includes('data-kui="scroll-snap-x"'));
  assert.ok(!html.includes('onclick'));
});
test('publishing and entry refs find raw, saved media config and placement slugs', () => {
  const raw = '<img data-media-slug="raw-photo"><video src="{{media:clip}}"></video>';
  const html = raw + `<div data-embed-config='{"type":"widget","slug":"photos","content":{"items":[{"slug":"placed"}]}}'></div>`;
  const bodyJson = { type: 'doc', content: [{ type: 'widgetEmbed', attrs: { placementId: 'p', widgetEntryId: 'w', content: { html: raw } } }] };
  assert.deepEqual([...collectReferencedMediaKeys({ bodyHtml: html, bodyJson })].sort(), ['clip', 'placed', 'raw-photo']);
  assert.ok(collectBodyReferences({ bodyHtml: html }).some(ref => ref.entityType === 'media' && ref.key === 'placed'));
  const refs = extractEntryRefs({ workspaceId: 'ws', sourceEntryId: 'post', sourceEntryType: 'post', bodyJson, fieldsExt: { widget: { widgetType: 'media', config: { items: [{ slug: 'saved' }], layout: 'bad' } } } });
  assert.deepEqual(refs.filter(ref => ref.targetKind === 'asset').map(ref => ref.targetId).sort(), ['clip', 'raw-photo', 'saved']);
  assert.deepEqual(extractHtmlEntryRefs({ workspaceId: 'ws', sourceEntryId: 'page', html }).filter(ref => ref.targetKind === 'asset').map(ref => ref.targetId).sort(), ['clip', 'placed', 'raw-photo']);
});

// All ports below are in memory. Phase timestamps distinguish loader/host stalls from resolver waits.
test('found slugs, missing slugs, audio and two placement overrides resolve through the actual shared media lifecycle', { timeout: 30000 }, async (t) => {
  const started = performance.now();
  t.diagnostic('phase: imports');
  const { InMemoryEntryRepo } = await import('#src/features/entries/index');
  const { InMemoryMediaRepo, InMemoryTransformDefinitionRepo } = await import('#src/features/media/index');
  const { buildWidgetHostPorts } = await import('#src/features/widgets/deps');
  const { buildWidgetAreaFieldsJson, buildWidgetInstanceFieldsJson, resolvePageWidgets, InMemoryWidgetRegionBindingRepo } = await import('@jini-ai/cms/widgets');
  const { resolveHtmlPageEmbeds, resolveGalleryWidgetMedia } = await import('@jini-ai/cms/widgets/html');
  const { registerCoreResolver, createGalleryWidgetResolver } = await import('@jini-ai/cms/widgets/resolvers');
  const { renderHtmlPageBody, renderDocNode } = await import('#src/server/inbound/public-http/http/site/render');
  t.diagnostic(`phase: seed (${Math.round(performance.now() - started)}ms)`);
  const workspaceId = 'mediawidget-ws', now = '2026-10-10T00:00:00.000Z';
  const entryRepo = new InMemoryEntryRepo(), mediaRepo = new InMemoryMediaRepo({}), transformRepo = new InMemoryTransformDefinitionRepo({});
  for (const slug of ['saved', 'first', 'second', 'sound']) await mediaRepo.save({ id: `${slug}-id`, workspaceId, title: slug, slug, alt: `Stored ${slug}`, caption: '', credit: '', source: { sha256: slug.padEnd(64, 'a') }, status: 'active', createdAt: now, updatedAt: now, version: 1, width: 1200, height: 800, cssClass: null, htmlAttributes: null });
  await transformRepo.insert({ id: 'public', workspaceId, name: 'public', version: 1, params: { format: 'webp' }, owner: 'core', createdAt: now });
  const config = { mode: 'media', items: [{ slug: 'saved' }], layout: 'grid', columns: 2 };
  await entryRepo.save({ id: 'media-widget', workspaceId, type: 'widget', slug: 'photos', title: 'Photos', status: 'draft', bodyJson: null, fieldsJson: buildWidgetInstanceFieldsJson({ payload: { widgetType: 'media', status: 'active', config } }), publishedAt: null, createdAt: now, updatedAt: now, version: 1 });
  const deps = { host: buildWidgetHostPorts({}, {}), entryRepo, mediaRepo, transformRepo, mediaContentTypeStore: { getMany: async () => new Map([['sound'.padEnd(64, 'a'), 'audio/mpeg']]) } };
  const requested: string[] = [];
  registerCoreResolver({ typeKey: 'gallery', resolver: createGalleryWidgetResolver({ resolveMedia: ({ refs, context }) => { requested.push(...refs.map(ref => ref.slug ?? ref.id!)); return resolveGalleryWidgetMedia({ refs, context, deps }); } }) });
  const marker = (content: Record<string, unknown>) => `<div data-embed-config='${JSON.stringify({ type: 'widget', slug: 'photos', content })}'></div>`;
  const html = marker({ items: [{ slug: 'first' }] }) + marker({ items: [{ slug: 'second' }] });
  t.diagnostic(`phase: HTML placements (${Math.round(performance.now() - started)}ms)`);
  const rendered = renderHtmlPageBody(html, await resolveHtmlPageEmbeds({ deps, input: { workspaceId, html } }));
  assert.ok(rendered.includes('/m/first/'));
  assert.ok(rendered.includes('/m/second/'));
  assert.ok(!rendered.includes('/m/saved/'));
  assert.ok(!requested.includes('saved'), 'overridden saved content must not consume the shared asset budget');
  assert.ok(rendered.indexOf('/m/first/') < rendered.indexOf('/m/second/'));
  const doc: JsonObject = { type: 'doc', content: [{ type: 'widgetEmbed', attrs: { placementId: 'p1', widgetEntryId: 'media-widget', content: { items: [{ slug: 'first' }] } } }, { type: 'widgetEmbed', attrs: { placementId: 'p2', widgetEntryId: 'media-widget', content: { mode: 'html', html: '<img data-media-slug="second"><img data-media-slug="missing"><script>bad()</script>' } } }] };
  t.diagnostic(`phase: TipTap placements (${Math.round(performance.now() - started)}ms)`);
  const widgets = await resolvePageWidgets({ deps: { entryRepo, bindingRepo: new InMemoryWidgetRegionBindingRepo() }, input: { workspaceId, resolvedRegions: [], pageBodyJson: doc } });
  const docHtml = renderDocNode(doc, widgets.inlineResolved);
  assert.ok(docHtml.includes('/m/first/'));
  assert.ok(docHtml.includes('/m/second/'));
  assert.ok(!/missing|bad\(\)|script|\/m\/saved\//.test(docHtml));
  assert.ok(!requested.includes('saved'), 'raw-mode override must not fetch an inactive structured list');
  t.diagnostic(`phase: region placement (${Math.round(performance.now() - started)}ms)`);
  await entryRepo.save({ id: 'area', workspaceId, type: 'widget_area', slug: 'area', title: 'Area', status: 'draft', bodyJson: null, fieldsJson: buildWidgetAreaFieldsJson({ payload: { regionKey: 'footer', doc: { schemaVersion: 1, placements: [{ placementId: 'region-p', widgetEntryId: 'media-widget', enabled: true, content: { items: [{ slug: 'second' }] } }] } } }), publishedAt: null, createdAt: now, updatedAt: now, version: 1 });
  const bindingRepo = new InMemoryWidgetRegionBindingRepo();
  await bindingRepo.upsert({ workspaceId, regionKey: 'footer', areaEntryId: 'area', updatedAt: now });
  const regions = await resolvePageWidgets({ deps: { entryRepo, bindingRepo }, input: { workspaceId, resolvedRegions: ['footer'] } });
  const regionHtml = renderWidgetIr(regions.regions.footer![0]);
  assert.ok(regionHtml.includes('/m/second/'));
  assert.ok(!regionHtml.includes('/m/saved/'));
  const inline = `<div data-embed-config='{"type":"media","content":{"items":[{"slug":"sound"},{"slug":"missing"}],"layout":"single"}}'></div>`;
  t.diagnostic(`phase: inline audio (${Math.round(performance.now() - started)}ms)`);
  const inlineResolved = await resolveHtmlPageEmbeds({ deps, input: { workspaceId, html: inline } });
  assert.equal(inlineResolved.get("media")?.get("media:1")?.componentId, "media");
  const inlineHtml = renderHtmlPageBody(inline, inlineResolved);
  assert.ok(inlineHtml.includes('<audio'));
  assert.ok(inlineHtml.includes('/m/sound/original.mp3'));
  assert.ok(!inlineHtml.includes('<img'));
  assert.ok(!inlineHtml.includes('missing'));
  const rawInline = `<div data-embed-config='${JSON.stringify({ type: 'media', content: { mode: 'html', html: '<img data-media-slug="first">' } })}'></div>`;
  const rawInlineHtml = renderHtmlPageBody(rawInline, await resolveHtmlPageEmbeds({ deps, input: { workspaceId, html: rawInline } }));
  assert.ok(rawInlineHtml.includes('/m/first/'));
  t.diagnostic(`phase: complete (${Math.round(performance.now() - started)}ms)`);
});

test('page and raw HTML serialization bound deeply nested imported markup', () => {
  const html = '<div>'.repeat(1000) + 'deep' + '</div>'.repeat(1000);
  const page = sanitizePageHtml({ html });
  assert.equal((page.match(/<div/g) ?? []).length, 128);
  assert.equal(renderMediaRawHtml({ html, media: {}, renderMedia }), page);
});

test('region HTTP placement normalization keeps content and rejects malformed content/duplicate slots', async () => {
  const { parseWidgetRegionPlacements } = await import('#src/server/inbound/admin-http/routes/widgets/region-mutate-placements');
  const content = { items: [{ slug: 'photo' }] };
  assert.deepEqual(parseWidgetRegionPlacements({ raw: [{ placementId: 'p', widgetEntryId: 'w', enabled: true, content, forged: true }] }), [{ placementId: 'p', widgetEntryId: 'w', enabled: true, content }]);
  assert.equal(parseWidgetRegionPlacements({ raw: [{ placementId: 'p', widgetEntryId: 'w', enabled: true, content: [] }] }), null);
  assert.equal(parseWidgetRegionPlacements({ raw: [{ placementId: 'p', widgetEntryId: 'w', enabled: true }, { placementId: 'p', widgetEntryId: 'w', enabled: true }] }), null);
});

test('shared widget reference scanner merges saved content before member gating and fails closed without its read port', async () => {
  const { collectPlacedWidgetMediaKeys } = await import('#src/features/publish-content/media-references');
  const bodyJson = { type: 'doc', content: [{ type: 'widgetEmbed', attrs: { placementId: 'p', widgetEntryId: 'w', content: { items: [{ slug: 'placed' }] } } }] };
  const savedWidgets = new Map([['w', { items: [{ slug: 'saved' }], layout: 'grid' }]]);
  const refs = collectPlacedWidgetMediaKeys({ bodyJson, savedWidgets });
  assert.equal(refs.readable, true);
  assert.deepEqual([...refs.keys], ['placed']);
  assert.equal(collectPlacedWidgetMediaKeys({ bodyJson }).readable, false);
  const html = `<div data-embed-config='${JSON.stringify({ type: 'widget', slug: 'w', content: { mode: 'html', html: '<img data-media-slug="raw">' } })}'></div>`;
  assert.deepEqual([...collectPlacedWidgetMediaKeys({ bodyHtml: html, savedWidgets }).keys], ['raw']);
});

test('media slug reference scans traverse deeply nested TipTap documents without losing the protecting reference', () => {
  let bodyJson: unknown = { type: 'widgetEmbed', attrs: { widgetEntryId: 'w', placementId: 'p', content: { items: [{ slug: 'protected' }] } } };
  for (let depth = 0; depth < 5000; depth++) bodyJson = { type: 'blockquote', content: [bodyJson] };
  assert.deepEqual([...collectReferencedMediaKeys({ bodyJson })], ['protected']);
});

test('assistant contracts advertise both Media modes and allow placement content on existing post widgets', async () => {
  const { widgetsAgentToolCatalog } = await import('#src/features/widgets/agent-tools');
  const { TIPTAP_DOC_SCHEMA } = await import('#src/features/post/agent-tools');
  for (const name of ['widgets_create_instance', 'widgets_update_instance']) {
    const schema = widgetsAgentToolCatalog.find(tool => tool.name === name)!.inputSchema as any;
    assert.ok(schema.properties.config.description.includes('mode:html'));
    assert.ok(schema.properties.config.description.includes('slug'));
  }
  const schema = TIPTAP_DOC_SCHEMA as any;
  const nodes = schema.$defs.blockNode.oneOf;
  const widget = nodes.find((node: any) => node.properties?.type?.const === 'widgetEmbed');
  assert.equal(widget.properties.attrs.properties.content.type, 'object');
});


test('audio shares player styling and forwarded marker attributes in widgets and TipTap media nodes', async () => {
  const { renderDocNode } = await import('#src/server/inbound/public-http/http/site/render');
  const html = renderWidgetIr({ componentId: 'media-image', props: { assetId: 'sound-id', slug: 'sound', contentType: 'audio/wav', cssClass: 'stored', htmlAttributes: 'class="asset" data-kui="stored"', markerAttributes: [{ name: 'class', value: 'placed' }, { name: 'data-kui', value: 'scroll-snap-x' }], controls: false } });
  assert.ok(html.includes('<audio'));
  assert.ok(html.includes('placed'));
  assert.ok(html.includes('asset'));
  assert.ok(html.includes('data-kui="scroll-snap-x"'));
  assert.ok(!html.includes(' controls'));
  const meta = { slug: 'sound', width: null, height: null, cssClass: 'stored', htmlAttributes: 'data-kui="stored"', contentType: 'audio/wav' };
  const doc = renderDocNode({ type: 'media', attrs: { assetId: 'sound-id', transformName: 'public', cssClass: 'node', htmlAttributes: 'data-kui="node"' } }, new Map(), new Map(), new Map([['sound-id', meta]]));
  assert.ok(doc.includes('<audio src="/m/sound/original.wav" controls'));
  assert.ok(doc.includes('class="node"'));
  assert.ok(doc.includes('data-kui="node"'));
});
