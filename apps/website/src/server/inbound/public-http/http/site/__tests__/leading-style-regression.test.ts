import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sanitizePageHtml, renderMediaRawHtml } from '@jini-ai/cms/widgets/html';
import { buildPostRecord } from '#src/features/post/__tests__/post-record.fixture';
import { InMemoryPostRepo } from '#src/features/post/index';
import { trashAwareEntryRepo } from '#src/features/entries/__tests__/support/trash-aware-entry-repo';
import { InMemoryVersionedMediaRepo } from "@jini-ai/cms/media";
import { InMemoryTransformDefinitionRepo } from '#src/features/media/index';
import { InMemoryMediaContentTypeStore } from '@jini-ai/cms/media/site/content-type-store';
import { InMemoryPresentationSettingsRepo } from '#src/features/presentation/index';
import { renderStaticPage } from '#src/features/theme/static-render';
import type { DiscoveredTheme } from '#src/features/theme/index';
import { MAX_CONTENT_EMBED_FETCHES, resolveHtmlFormatContentMarkers } from "@jini-ai/cms/widgets/content-markers";
import { contentMarkerPorts } from "#src/server/inbound/public-http/routes/site/pages/render-context/content-marker-ports";
import type { ContentMarkerResolutionDeps } from "#src/server/inbound/public-http/routes/site/pages/render-context/deps";
import { renderWidgetPreview } from '#src/server/inbound/admin-http/routes/widgets/preview-render';
import { createGalleryWidgetResolver } from '@jini-ai/cms/widgets/resolvers';
import { renderSite } from '../render-site.js';
import { injectFormSubmissionResultIntoHtml } from "@jini-ai/cms/forms/result-html";
import { FORM_FEEDBACK, FORM_RESULT_MARKUP } from "../form-feedback-policy.js";
import { renderWidgetIr } from '../render/content-html.js';

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
  assert.equal(injectFormSubmissionResultIntoHtml({ html: body, result: undefined, markup: FORM_RESULT_MARKUP, feedback: FORM_FEEDBACK }), body);
  assert.equal(injectFormSubmissionResultIntoHtml({ html: body, result: { kind: 'success', slug: 'absent' }, markup: FORM_RESULT_MARKUP, feedback: FORM_FEEDBACK }), body);
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
  const bodyHtml = body + '<script>window.contentReady = "$&";</script>';
  const post = buildPostRecord({ workspaceId, kind: 'page', bodyFormat: 'html', bodyHtml });
  const deps: ContentMarkerResolutionDeps = {
    workspaceId, postRepo: new InMemoryPostRepo({}, { initialRows: [post] }),
    entryRepo: trashAwareEntryRepo(), mediaRepo: new InMemoryVersionedMediaRepo({}),
    mediaContentTypeStore: new InMemoryMediaContentTypeStore(),
    transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}, { initialRows: [] }),
  };
  const shell = `<main data-embed-config='{"type":"content","id":"${post.id}"}'></main>`;
  const expected = `<main>${bodyHtml}</main>`;
  const saved = await resolveHtmlFormatContentMarkers({ ports: contentMarkerPorts({ deps }), html: shell, depth: 0, budget: { remaining: MAX_CONTENT_EMBED_FETCHES } });
  assert.equal(saved, expected);
  const pending = await resolveHtmlFormatContentMarkers({ ports: contentMarkerPorts({ deps }), html: shell, depth: 0, budget: { remaining: MAX_CONTENT_EMBED_FETCHES } }, { pendingHtmlOverride: { id: post.id, slug: post.slug, bodyHtml } });
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
