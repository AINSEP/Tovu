import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sanitizePageHtml, renderMediaRawHtml } from '#src/features/widgets/media-html';
import { buildPostRecord } from '#src/features/post/__tests__/post-record.fixture';
import { InMemoryPostRepo } from '#src/features/post/index';
import { TrashAwareInMemoryEntryRepo } from '#src/features/entries/trash-aware-memory-repo';
import { InMemoryVersionedMediaRepo } from '#src/features/media/versioned-media-repo';
import { InMemoryMediaContentTypeStore, InMemoryTransformDefinitionRepo } from '#src/features/media/index';
import { InMemoryPresentationSettingsRepo } from '#src/features/presentation/index';
import { renderStaticPage } from '#src/features/theme/static-render';
import type { DiscoveredTheme } from '#src/features/theme/index';
import { MAX_CONTENT_EMBED_FETCHES, resolveHtmlFormatContentMarkers, type ContentMarkerResolutionDeps } from '#src/server/inbound/public-http/routes/site/pages';
import { renderWidgetPreview } from '#src/server/inbound/admin-http/routes/widgets/preview-render';
import { createGalleryWidgetResolver } from '@jini-ai/cms/widgets/resolvers';
import { renderSite, renderWidgetIr, injectFormSubmissionResultIntoHtml } from '../render.js';

// The complete leading stylesheet from Landing v130, including its CSS checkmark escape.
// Keep this independent of the local evidence directory so CI exercises the actual regression.
const body = readFileSync(new URL('./fixtures/landing-leading-style.html', import.meta.url), 'utf8');
const leadingStyle = body.slice(0, body.indexOf('</style>') + '</style>'.length);
const workspaceId = 'ws-leading-style';
const theme = {
  manifest: { id: 'test', name: 'Test', tier: 'static', apiVersion: 2 },
  tokens: {}, tokensLight: {}, pages: {}, partials: {}, css: '', layouts: {},
  status: 'valid', errors: [], source: 'site', dir: '/unused',
} as unknown as DiscoveredTheme;

test('the full leading stylesheet and subsequent sections survive page and Raw HTML sanitization exactly', () => {
  assert.equal(sanitizePageHtml({ html: body }), body);
  assert.equal(renderMediaRawHtml({ html: body, media: {}, renderMedia: ({ props }) => renderWidgetIr({ componentId: 'media-image', props }) }), body);
  assert.equal(injectFormSubmissionResultIntoHtml(body, undefined), body);
  assert.equal(injectFormSubmissionResultIntoHtml(body, { kind: 'success', slug: 'absent' }), body);
});

test('page and post body rendering retains every leading stylesheet byte', async () => {
  for (const kind of ['page', 'post'] as const) {
    const post = buildPostRecord({ workspaceId, kind, bodyFormat: 'html', bodyHtml: body });
    const html = await renderSite({ theme: null, route: 'post', siteTitle: 'Test', posts: [], post });
    assert.equal(html.includes(body), true, kind);
    assert.equal(html.slice(html.indexOf(leadingStyle), html.indexOf(leadingStyle) + leadingStyle.length), leadingStyle);
  }
});

test('static content splicing retains the leading stylesheet in saved and pending HTML bodies', async () => {
  const post = buildPostRecord({ workspaceId, kind: 'page', bodyFormat: 'html', bodyHtml: body });
  const deps: ContentMarkerResolutionDeps = {
    workspaceId, postRepo: new InMemoryPostRepo([post]),
    entryRepo: new TrashAwareInMemoryEntryRepo(), mediaRepo: new InMemoryVersionedMediaRepo(),
    mediaContentTypeStore: new InMemoryMediaContentTypeStore(),
    transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}, { initialRows: [] }),
  };
  const shell = `<main data-embed-config='{"type":"content","id":"${post.id}"}'></main>`;
  const expected = `<main>${body}</main>`;
  const saved = await resolveHtmlFormatContentMarkers(deps, shell, 0, { remaining: MAX_CONTENT_EMBED_FETCHES });
  assert.equal(saved, expected);
  const pending = await resolveHtmlFormatContentMarkers(deps, shell, 0, { remaining: MAX_CONTENT_EMBED_FETCHES }, { id: post.id, slug: post.slug, bodyHtml: body });
  assert.equal(pending, expected);
  const html = renderStaticPage({ theme, pageId: 'test', htmlOverride: `<!doctype html><html><head></head><body>${saved}</body></html>` });
  assert.equal(html?.includes(expected), true);
});

test('unsaved Media widget preview retains the same leading stylesheet in both theme shells', async () => {
  const presentationRepo = new InMemoryPresentationSettingsRepo({}, {
    initialRows: [{ workspaceId, activeThemeId: 'none', updatedAt: '2026-10-11T00:00:00.000Z' }],
  });
  // Fake only library I/O; the existing resolver, sanitizer and preview renderer all run.
  const resolver = createGalleryWidgetResolver({ resolveMedia: async () => new Map() });
  const deps = { workspaceId, presentationRepo, themes: [theme] };
  for (const activeThemeId of ['none', 'test']) {
    await presentationRepo.save({ workspaceId, activeThemeId, updatedAt: '2026-10-11T00:00:00.000Z' });
    const output = await renderWidgetPreview({ deps, input: { widgetType: 'media', content: { mode: 'html', html: body } } }, {
      resolve: ({ instances, context }) => resolver.resolveMany(instances, context),
    });
    assert.equal(output.html, body);
    assert.equal(output.document.includes(body), true, activeThemeId);
  }
});

test('Unicode glyphs never excuse executable CSS, unsafe inline CSS or executable markup', () => {
  for (const css of ['@import url(x)', 'width:\\65 xpression(1)', 'background:url(\\6a avascript:x)', '-moz-binding:url(x)', 'behavior:url(x)']) {
    const html = `<style>.check::before{content:"\\2713"}${css}</style><section><p>Kept</p></section>`;
    assert.equal(sanitizePageHtml({ html }), '<section><p>Kept</p></section>', css);
  }
  assert.equal(sanitizePageHtml({ html: `<style>.check::before{content:"\\2713"}</style><section style="content:'\\2713'" onclick="evil()"><script>evil()</script><p>Kept</p></section>` }),
    `<style>.check::before{content:"\\2713"}</style><section><p>Kept</p></section>`);
});
