/**
 * @file The "Import site" header entry (2026-10-18): it opens a site's own admin IN-APP on the
 * Sites screen's Import tab, never in an external browser (a desktop site signs in through the
 * webview's boot token, so a browser would land on a login page).
 *
 * Pure parts are asserted directly; the wiring is asserted against comment-stripped source, the
 * way `use-add-site.hooks.test.ts` does for the sibling header button.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE_ADMIN_PAGES, resolveImportSiteTarget } from './import-site-entry.js';
import { siteSurfaceUrl } from './use-site-workspace.hooks.js';
import { tabAfterClose } from './site-shell-policy.js';
import { hookHarness, sourceFunction } from './source-test-harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const app = withoutComments(fs.readFileSync(path.join(here, 'App.tsx'), 'utf8'));
const hooks = fs.readFileSync(path.join(here, 'App.hooks.ts'), 'utf8');

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

test('the tab hook remembers a requested admin page per tab and forgets it on close', () => {
  const harness = hookHarness();
  const useTabs = sourceFunction(hooks, 'useProjectTabs', { ...harness.bindings, tabAfterClose });
  const render = () => harness.render(() => useTabs());
  render().openProjectTab('a', { adminPage: 'import' }); render();
  render().openProjectTab('b'); render();
  assert.deepEqual(render().adminPages, { a: 'import' });
  assert.equal(render().activeTab, 'b');
  render().openProjectTab('a'); render();
  assert.deepEqual(render().adminPages, { a: 'import' }, 'reopening without a page keeps where the tab was sent');
  render().closeProjectTab('a'); render();
  assert.deepEqual(render().adminPages, {});
});

test('the header button opens the target tab on the import page and hides with no target', () => {
  assert.match(app, /resolveImportSiteTarget\(\{ projects \}\)/);
  assert.match(app, /openProjectTab\(importTarget, \{ adminPage: 'import' \}\)/);
  assert.match(app, /onImportSite && \(\s*<button type="button" className="button button--quiet" onClick=\{onImportSite\}>\s*Import site\s*<\/button>/);
});

test('each workspace receives its own requested admin page', () => {
  assert.match(app, /adminPage=\{adminPages\[project\.id\]\}/);
  assert.match(app, /useSiteWorkspace\(project, hidden, \{ adminPage \}\)/);
});
