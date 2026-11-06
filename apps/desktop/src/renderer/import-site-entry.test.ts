/**
 * @file Where the Import page sends a new site (2026-11-06): the allowlisted admin path, the
 * address checks that keep anything but http(s) out of the guest's URL, and the name a new site
 * gets from an address. The wiring is rendered from the real modules in `App.render.test.ts`
 * (Import never opens or starts a site), `ImportWebsite.render.test.ts` and
 * `app/SiteWorkspace.render.test.ts` (a tab loads its own page).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SITE_ADMIN_PAGES, adminPagePath, sameAdminPage, siteNameFromAddress, websiteAddress } from './import-site-entry.js';
import { siteSurfaceUrl } from './use-site-workspace.hooks.js';

test('the import page is an allowlisted admin path, never one the renderer composes', () => {
  assert.deepEqual(SITE_ADMIN_PAGES, { import: 'import-export?tab=import' });
  assert.equal(adminPagePath({}), '');
  assert.equal(adminPagePath({ adminPage: { page: 'import' } }), 'import-export?tab=import');
});

test('a live address rides along encoded; anything that is not an http(s) address is dropped', () => {
  assert.equal(
    adminPagePath({ adminPage: { page: 'import', liveAddress: 'https://example.com/a?b=1&c=2' } }),
    'import-export?tab=import&liveImport=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2',
  );
  assert.equal(adminPagePath({ adminPage: { page: 'import', liveAddress: 'javascript:alert(1)' } }), 'import-export?tab=import');
});

test('typed addresses: a bare host gets https, other schemes and non-hosts are refused', () => {
  assert.equal(websiteAddress({ text: ' example.com ' }), 'https://example.com/');
  assert.equal(websiteAddress({ text: 'http://example.com/shop' }), 'http://example.com/shop');
  for (const text of ['', '   ', 'ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'two words.com', 'localhost', 'https://']) {
    assert.equal(websiteAddress({ text }), null, text);
  }
});

test('a new site is named after the address host, without www', () => {
  assert.equal(siteNameFromAddress({ address: 'https://www.example.com/shop' }), 'example.com');
  assert.equal(siteNameFromAddress({ address: 'http://blog.example.org' }), 'blog.example.org');
});

test('the same landing is recognized so reopening a tab keeps its record', () => {
  assert.equal(sameAdminPage({ a: { page: 'import', liveAddress: 'https://x.com/' }, b: { page: 'import', liveAddress: 'https://x.com/' } }), true);
  assert.equal(sameAdminPage({ a: { page: 'import' }, b: { page: 'import', liveAddress: 'https://x.com/' } }), false);
  assert.equal(sameAdminPage({ a: undefined, b: { page: 'import' } }), false);
});

test('a tab asked for the import page loads the admin on it; the public site ignores it', () => {
  const adminPage = { page: 'import' as const };
  assert.equal(siteSurfaceUrl({ port: 4321, view: 'admin', status: 'running', adminPage }), 'http://127.0.0.1:4321/admin/import-export?tab=import');
  assert.equal(siteSurfaceUrl({ port: 4321, view: 'admin', status: 'running' }), 'http://127.0.0.1:4321/admin/');
  assert.equal(siteSurfaceUrl({ port: 4321, view: 'site', status: 'running', adminPage }), 'http://127.0.0.1:4321/');
  assert.equal(siteSurfaceUrl({ port: 4321, view: 'admin', status: 'stopped', adminPage }), '');
  assert.equal(
    siteSurfaceUrl({ port: 4321, view: 'admin', externalUrl: 'https://localhost:3000/admin/', adminPage }),
    'https://localhost:3000/admin/import-export?tab=import',
  );
});
