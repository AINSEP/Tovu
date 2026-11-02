/**
 * @file The "Import site" header entry (2026-10-18): it opens a site's own admin IN-APP on the
 * Sites screen's Import tab, never in an external browser (a desktop site signs in through the
 * webview's boot token, so a browser would land on a login page).
 *
 * The pure parts are asserted here. The wiring is rendered from the real modules: the header button
 * opening the running site's tab on its Import page, and hiding with no site (`App.render.test.ts`),
 * the tab hook remembering the page per tab (`use-project-tabs.hooks.render.test.ts`), and each
 * workspace loading its own page (`app/SiteWorkspace.render.test.ts`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SITE_ADMIN_PAGES, resolveImportSiteTarget } from './import-site-entry.js';
import { siteSurfaceUrl } from './use-site-workspace.hooks.js';

const project = (id: string, status: 'running' | 'stopped' | 'starting') => ({ id, status });

test('the target is the first running site, else the first site, else none', () => {
  assert.equal(resolveImportSiteTarget({ projects: [project('a', 'stopped'), project('b', 'running'), project('c', 'running')] }), 'b');
  assert.equal(resolveImportSiteTarget({ projects: [project('a', 'stopped'), project('b', 'starting')] }), 'a');
  assert.equal(resolveImportSiteTarget({ projects: [] }), null);
});

test('the import page is an allowlisted admin path, never one the renderer composes', () => {
  assert.deepEqual(SITE_ADMIN_PAGES, { import: 'import-export?tab=import' });
});

test('a tab asked for the import page loads the admin on it; the public site ignores it', () => {
  assert.equal(siteSurfaceUrl({ port: 4321, view: 'admin', status: 'running', adminPage: 'import' }), 'http://127.0.0.1:4321/admin/import-export?tab=import');
  assert.equal(siteSurfaceUrl({ port: 4321, view: 'admin', status: 'running' }), 'http://127.0.0.1:4321/admin/');
  assert.equal(siteSurfaceUrl({ port: 4321, view: 'site', status: 'running', adminPage: 'import' }), 'http://127.0.0.1:4321/');
  assert.equal(siteSurfaceUrl({ port: 4321, view: 'admin', status: 'stopped', adminPage: 'import' }), '');
  assert.equal(
    siteSurfaceUrl({ port: 4321, view: 'admin', externalUrl: 'https://localhost:3000/admin/', adminPage: 'import' }),
    'https://localhost:3000/admin/import-export?tab=import',
  );
});
