import type { JsonObject } from "@jini-ai/core/primitives";
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHtmlPageEmbeds } from '@jini-ai/cms/widgets/html';
import { InMemoryEntryRepo } from '#src/features/entries/index';
import { InMemoryMediaRepo, InMemoryTransformDefinitionRepo, CORE_PUBLIC_TRANSFORM_NAME } from '#src/features/media/index';
import { buildWidgetHostPorts } from '#src/features/widgets/deps';
import { renderHtmlPageBody } from '#src/server/inbound/public-http/http/site/render';
import { extractHtmlEntryRefs } from '#src/contracts/core/entry-refs/extractor';
import { collectReferencedMediaKeys } from '#src/features/publish-content/media-references';

const workspaceId = 'gallery-workspace';
const now = '2026-10-09T00:00:00.000Z';
const marker = (config: Record<string, unknown>) => `<div data-embed-config='${JSON.stringify({ type: 'gallery', ...config })}'></div>`;

test('gallery resolves real media and renders ordered figures, captions, responsive source and occurrence layouts', async () => {
  const mediaRepo = new InMemoryMediaRepo({});
  const transformRepo = new InMemoryTransformDefinitionRepo({});
  for (const id of ['one', 'two']) await mediaRepo.save({
    id, workspaceId, title: id, slug: `photo-${id}`, alt: `Stored ${id}`, caption: '', credit: '',
    source: { sha256: id === 'one' ? 'a'.repeat(64) : 'b'.repeat(64) }, status: 'active',
    createdAt: now, updatedAt: now, version: 1, width: 1200, height: 800, cssClass: null, htmlAttributes: null,
  });
  await transformRepo.insert({ id: 'public', workspaceId, name: CORE_PUBLIC_TRANSFORM_NAME, version: 1, params: { format: 'webp' }, owner: 'core', createdAt: now });
  const images = [{ mediaId: 'one', alt: 'Author alt', caption: '<first>' }, { mediaId: 'two', alt: '' }];
  const html = marker({ images, layout: 'grid', columns: 2 }) + marker({ images: [...images].reverse(), layout: 'carousel' });
  const resolved = await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), entryRepo: new InMemoryEntryRepo(), mediaRepo, transformRepo }, input: { workspaceId, html } });
  const rendered = renderHtmlPageBody(html, resolved);
  assert.equal((rendered.match(/<figure /g) ?? []).length, 4);
  assert.ok(rendered.includes('jini-gallery-grid'));
  assert.ok(rendered.includes('jini-gallery-carousel'));
  assert.ok(rendered.includes('tabindex="0"'));
  assert.ok(rendered.includes('src="/m/photo-one/public.v1/image.jpg?v=aaaaaaaaaaaa"'));
  assert.ok(rendered.includes('srcset="/m/photo-one/public.v1/image.jpg?v=aaaaaaaaaaaa 1x"'));
  assert.ok(rendered.includes('alt="Author alt"'));
  assert.ok(rendered.includes('alt=""'));
  assert.ok(rendered.includes('<figcaption>&lt;first&gt;</figcaption>'));
  assert.ok(!rendered.includes('data-embed-config'));
  const carousel = rendered.slice(rendered.indexOf('class="jini-gallery jini-gallery-carousel"'));
  assert.ok(carousel.indexOf('/m/photo-two/') < carousel.indexOf('/m/photo-one/'));
});

test('gallery media references protect every image and publish keys remain visible with invalid layout', () => {
  const html = marker({ layout: 'invalid', images: [{ mediaId: 'one' }, { mediaId: 'two' }, { mediaId: 'one' }, { src: 'https://example.com/m/three/original' }] });
  const refs = extractHtmlEntryRefs({ workspaceId, sourceEntryId: 'page', html });
  assert.deepEqual(refs.map(ref => [ref.targetKind, ref.targetId]), [['asset', 'one'], ['asset', 'two'], ['asset', 'one']]);
  assert.equal(new Set(refs.map(ref => ref.fieldPath)).size, 3);
  assert.deepEqual([...collectReferencedMediaKeys({ bodyHtml: html })].sort(), ['one', 'three', 'two']);
  const encoded = html.replace(/data-embed-config='([^']*)'/g, (_match, json: string) => `data-embed-config="${json.replace(/"/g, '&quot;')}"`);
  assert.deepEqual([...collectReferencedMediaKeys({ bodyHtml: encoded })].sort(), ['one', 'three', 'two']);
});

test('50 gallery image references do not hide the following ordinary media embed', () => {
  const html = marker({ layout: 'grid', images: Array.from({ length: 50 }, (_, i) => ({ mediaId: `image-${i}` })) }) + `<div data-embed-config='{"type":"media","id":"last"}'></div>`;
  const refs = extractHtmlEntryRefs({ workspaceId, sourceEntryId: 'page', html });
  assert.equal(refs.length, 51);
  assert.equal(refs.at(-1)?.targetId, 'last');
  const repeated = Array.from({ length: 51 }, () => marker({ layout: 'grid', images: [{ mediaId: 'one' }] })).join('');
  assert.equal(extractHtmlEntryRefs({ workspaceId, sourceEntryId: 'page', html: repeated }).length, 50);
});

test('gallery source URLs retain the image renderer security policy and missing-alt flags', () => {
  const config: JsonObject = { layout: 'masonry', images: [{ src: 'https://example.com/photo.jpg' }, { src: 'https://example.com/workspaces/ws/media/id/./original', alt: 'Private' }] };
  const html = marker(config);
  const resolved = new Map([['gallery', new Map([['gallery:1', { componentId: 'gallery', props: { config, media: {} } }]])]]);
  const rendered = renderHtmlPageBody(html, resolved);
  assert.ok(rendered.includes('src="https://example.com/photo.jpg"'));
  assert.ok(rendered.includes('data-jini-alt-missing="true"'));
  assert.ok(!rendered.includes('src="https://example.com/workspaces/'));
  assert.ok(rendered.includes('jini-gallery-masonry'));
});
