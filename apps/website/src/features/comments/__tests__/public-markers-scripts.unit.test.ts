import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommentsProviderRegistry, type CommentsProviderDefinition, type CommentsProviderAdapter } from '@jini-ai/capability-providers/comments';
import type { DeclaredScript } from '@jini-ai/cookie-consent';
import { renderCommentsMarkers } from '../public-markers.js';

const entry = { id: 'entry', slug: 'story', title: 'Story', canonicalUrl: '/story', status: 'published' };
const marker = '<div class="thread" data-embed-config=\'{"type":"comments"}\'>fallback</div>';

function fixture(category: 'functional' | 'marketing') {
  let renders = 0;
  let reads = 0;
  const definition: CommentsProviderDefinition = { id: 'comments', label: 'Comments', kind: 'embedded', consentCategory: category,
    csp: { scriptSrc: [], frameSrc: [], connectSrc: [], styleSrc: [] }, settingsSchema: [], implementation: 'adapter' };
  const adapter: CommentsProviderAdapter = { kind: 'embedded', dashboardUrl: '/admin/comments', renderer: { renderThread: async () => {
    renders++;
    return { html: '<p>Approved comment</p><iframe data-src="https://comments.example/frame" data-consent-category="functional"></iframe>', scripts: [{ src: '/comments.js' }, { src: 'https://comments.example/sdk.js' }] };
  } } };
  const providers = createCommentsProviderRegistry({ selections: { read: async () => { reads++; return { providerId: 'comments', revision: 1 }; }, compareAndSet: async () => false } });
  providers.register({ definition, resolve: async () => adapter });
  return { providers, renders: () => renders, reads: () => reads };
}

for (const category of ['functional', 'marketing'] as const) test(`only optional comment scripts receive the ${category} requirement`, async () => {
  const f = fixture(category);
  const mutable: (readonly DeclaredScript[])[] = [];
  const html = await renderCommentsMarkers({ html: marker + marker, siteId: 'site', entry, providers: f.providers }, { scripts: ({ scripts }) => mutable.push(scripts) });
  assert.match(html, /Approved comment/);
  assert.equal(html.match(/Approved comment/g)?.length, 2);
  assert.match(html, /<iframe data-src="https:\/\/comments.example\/frame" data-consent-category="functional"><\/iframe>/);
  assert.ok(!html.includes('comments.js'), 'scripts are declarations, never executable tags inserted into stored comments');
  assert.deepEqual(mutable, [[{ src: '/comments.js', consent: [category] }, { src: 'https://comments.example/sdk.js', consent: [category] }]]);
  assert.equal(f.renders(), 1, 'multiple markers reuse one provider render and declaration emission');
  assert.equal(f.reads(), 1);
});

test('marker-free and draft pages emit no scripts or provider reads', async () => {
  const f = fixture('functional');
  let emitted = 0;
  const options = { scripts: () => { emitted++; } };
  const plain = '<p>Ordinary page bytes</p>';
  assert.equal(await renderCommentsMarkers({ html: plain, siteId: 'site', entry, providers: f.providers }, options), plain);
  assert.ok(!(await renderCommentsMarkers({ html: marker, siteId: 'site', entry: { ...entry, status: 'draft' }, providers: f.providers }, options)).includes('Approved comment'));
  assert.equal(f.renders(), 0);
  assert.equal(f.reads(), 0);
  assert.equal(emitted, 0);
});
