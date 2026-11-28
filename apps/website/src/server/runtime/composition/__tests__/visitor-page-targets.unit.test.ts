import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRouteDeps } from '../app.js';
import { createVisitorPageTargets } from '../visitor-page-targets.js';
import { buildPostRecord } from '#src/features/post/__tests__/post-record.fixture';
import { resolveActiveTheme, type DiscoveredTheme } from '#src/features/theme/index';
import { resolveActiveThemeId } from '@jini-ai/cms/presentation/site/active-theme-id';
import { postPublicPath } from '#src/platform/routing/index';
import type { RedirectRecord } from '@jini-ai/cms/redirects';

test('one publication read serves anonymous membership filtering and occupied theme slugs', async () => {
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  await deps.postRepo.save(buildPostRecord({ id: 'public', workspaceId: deps.workspaceId, slug: 'public-page', status: 'published' }));
  await deps.postRepo.save(buildPostRecord({ id: 'private', workspaceId: deps.workspaceId, slug: 'member-page', status: 'published', memberAccessJson: '{"visibility":"members"}' }));
  let reads = 0;
  const list = deps.postRepo.list.bind(deps.postRepo);
  deps.postRepo.list = async (...args) => { reads++; return list(...args); };
  const pages = await createVisitorPageTargets({ deps }).list({});
  assert.equal(reads, 1);
  assert.ok(pages.some(page => page.id === 'public'));
  assert.ok(pages.every(page => page.id !== 'private'));
});

/** The composition's own active static theme, re-published with an explicit page allow-list (swapped in as a theme edit does). */
async function publishThemePages(deps: ReturnType<typeof createRouteDeps>, override: { tier?: DiscoveredTheme['manifest']['tier'] } = {}) {
  const active = resolveActiveTheme({ deps, activeThemeId: await resolveActiveThemeId(deps) });
  assert.ok(active && active !== 'none' && active.manifest.tier === 'static', 'fixture: the composition renders a static theme');
  const pages = { ...active.pages, gallery: '<p>gallery</p>', contact: '<p>contact</p>', 'public-page': '<p>taken</p>', signin: '<p>in</p>', signup: '<p>up</p>', pricing: '<p>unpublished</p>' };
  const clone: DiscoveredTheme = { ...active, pages, manifest: { ...active.manifest, ...override, publishedPages: ['gallery', 'contact', 'public-page', 'signin', 'signup'] } };
  deps.themes = deps.themes.map(theme => theme.manifest.id === active.manifest.id ? clone : theme);
}

test('published static theme pages join the posts, except slugs a post occupies, the auth pages and unpublished pages', async () => {
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  await deps.postRepo.save(buildPostRecord({ id: 'public', workspaceId: deps.workspaceId, slug: 'public-page', title: 'Public page', status: 'published' }));
  await publishThemePages(deps);
  const pages = await createVisitorPageTargets({ deps }).list({});
  assert.deepEqual(pages.filter(page => page.id.startsWith('theme:')).sort((a, b) => a.id.localeCompare(b.id)), [
    { id: 'theme:contact', label: 'contact', path: '/contact' },
    { id: 'theme:gallery', label: 'gallery', path: '/gallery' },
  ]);
  assert.deepEqual(pages.find(page => page.id === 'public'), { id: 'public', label: 'Public page', path: postPublicPath({ slug: 'public-page' }) });
});

test('a theme that is not static tier contributes no pages, even with a page allow-list', async () => {
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  await publishThemePages(deps, { tier: 'templated' });
  assert.deepEqual((await createVisitorPageTargets({ deps }).list({})).filter(page => page.id.startsWith('theme:')), []);
});

test('assertPath refuses reserved routes and any redirected path, and accepts a plain site path', async () => {
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  // Pre-content resolution reads only override rules: one lands on a site page, one points into the reserved admin surface.
  const rule = (id: string, fromPattern: string, toTarget: string) => ({ id, workspaceId: deps.workspaceId, matchType: 'exact', fromPattern, toTarget, statusCode: 301,
    status: 'active', override: true, priority: 0, source: 'manual', createdByPrincipal: 'system', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', version: 1 }) satisfies RedirectRecord;
  for (const record of [rule('redirect-old', '/old-page', '/new-page'), rule('redirect-admin', '/legacy-page', '/admin/posts')]) {
    await deps.redirectRepo.save({ record, revision: { redirectId: record.id, workspaceId: record.workspaceId, seq: 1, state: record, tombstoned: false, actorId: 'system', recordedAt: record.createdAt } });
  }
  const targets = createVisitorPageTargets({ deps });
  await assert.rejects(targets.assertPath({ path: '/admin/posts' }), { message: 'Reserved route' });
  await assert.rejects(targets.assertPath({ path: '/old-page' }), { message: 'Redirect navigation refused' }, 'a matched redirect is never followed');
  await assert.rejects(targets.assertPath({ path: '/legacy-page' }), { message: 'Redirect navigation refused' }, 'a refused redirect is not read as no redirect');
  assert.equal(await targets.assertPath({ path: '/new-page' }), undefined);
});

test('theme pages on a reserved route or carrying a query or fragment are never offered as visitor targets', async () => {
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  const active = resolveActiveTheme({ deps, activeThemeId: await resolveActiveThemeId(deps) });
  assert.ok(active && active !== 'none' && active.manifest.tier === 'static', 'fixture: the composition renders a static theme');
  // `%61dmin` passes the theme's own literal reserved-name check but decodes to the admin surface.
  const extra = ['%61dmin', 'faq#top', 'menu?day=1', 'about-us'];
  const clone: DiscoveredTheme = { ...active, pages: { ...active.pages, ...Object.fromEntries(extra.map(id => [id, `<p>${id}</p>`])) },
    manifest: { ...active.manifest, publishedPages: extra } };
  deps.themes = deps.themes.map(theme => theme.manifest.id === active.manifest.id ? clone : theme);
  const pages = await createVisitorPageTargets({ deps }).list({});
  assert.deepEqual(pages.filter(page => page.id.startsWith('theme:')), [{ id: 'theme:about-us', label: 'about-us', path: '/about-us' }]);
});
