import assert from 'node:assert/strict';
import test from 'node:test';
import { subscribeWorkspaceThemePreview } from './site-theme-preview.hooks.js';
import type { SiteThemePreviewRefresh } from '../contracts/project.js';

test('only matching public site guests reload once; local tool paths use the current live port', async () => {
  let receive!: (frame: SiteThemePreviewRefresh) => void;
  let disposed = false;
  const calls: unknown[] = [], actions: unknown[] = [];
  const off = subscribeWorkspaceThemePreview({
    bridge: { watchSitePreview: ({ siteDir, listener }) => { assert.equal(siteDir, '/a'); receive = listener; return () => { disposed = true; }; } },
    siteDir: '/a', port: 4300, running: true, url: 'http://127.0.0.1:4300/about',
    guest: { reloadIgnoringCache: () => { calls.push('reload'); }, loadURL: async (url, options) => { calls.push([url, options]); } },
    dispatch: (action) => actions.push(action),
  });
  receive({ siteDir: '/b', revision: 'other' }); assert.deepEqual(calls, []);
  receive({ siteDir: '/a', revision: 'saved' }); receive({ siteDir: '/a', revision: 'saved' });
  receive({ siteDir: '/a', revision: 'tool', path: '/new?x=1#body' });
  await Promise.resolve();
  assert.deepEqual(calls, ['reload', ['http://127.0.0.1:4300/new?x=1#body', { extraHeaders: 'pragma: no-cache\n' }]]);
  assert.deepEqual(actions, [{ type: 'soft-load' }, { type: 'soft-load' }]);
  off?.(); assert.equal(disposed, true);
  receive({ siteDir: '/a', revision: 'late' }); assert.equal(calls.length, 2);
});

test('admin, stopped and foreign-origin guests do not subscribe, and every guest failure is contained', async () => {
  for (const url of ['http://127.0.0.1:4300/admin/', 'https://other.test/about', 'http://127.0.0.1:4200/']) {
    const off = subscribeWorkspaceThemePreview({ bridge: { watchSitePreview: () => assert.fail('wrong guest') }, siteDir: '/a', port: 4300, running: true, url, guest: { reloadIgnoringCache: () => assert.fail('wrong guest reload'), loadURL: async () => { assert.fail('wrong guest load'); } }, dispatch: () => {} });
    assert.equal(off, undefined);
  }
  for (const path of [undefined, '/about', '//other.test/', '/%61dmin/', '/%2e%2e/api/', '/x\\y', '/%2fother.test/']) {
    let receive!: (frame: SiteThemePreviewRefresh) => void;
    const off = subscribeWorkspaceThemePreview({
      bridge: { watchSitePreview: ({ listener }) => { receive = listener; return () => {}; } },
      siteDir: '/a', port: 4300, running: true, url: 'http://127.0.0.1:4300/',
      guest: { reloadIgnoringCache: () => { throw new Error('detached'); }, loadURL: () => { throw new Error('detached'); } }, dispatch: () => {},
    });
    assert.doesNotThrow(() => receive({ siteDir: '/a', revision: 'one', path })); off?.();
  }
  let receive!: (frame: SiteThemePreviewRefresh) => void;
  const off = subscribeWorkspaceThemePreview({ bridge: { watchSitePreview: ({ listener }) => { receive = listener; return () => {}; } }, siteDir: '/a', port: 4300, running: true, url: 'http://127.0.0.1:4300/', guest: { reloadIgnoringCache: () => {}, loadURL: () => Promise.reject(new Error('aborted')) }, dispatch: () => {} });
  receive({ siteDir: '/a', revision: 'reject', path: '/about' }); await Promise.resolve(); off?.();
});


test('invalid tool paths never call into a guest; stopped guests never acquire a stream', () => {
  let receive!: (frame: SiteThemePreviewRefresh) => void;
  let calls = 0;
  const guest = { reloadIgnoringCache: () => { calls++; }, loadURL: async () => { calls++; } };
  const bridge = { watchSitePreview: ({ listener }: { listener: (frame: SiteThemePreviewRefresh) => void }) => { receive = listener; return () => {}; } };
  const off = subscribeWorkspaceThemePreview({ bridge, siteDir: '/a', port: 4300, running: true, url: 'http://127.0.0.1:4300/', guest, dispatch: () => {} });
  for (const [index, path] of ['//other.test/', '/%61dmin/', '/%2e%2e/api/', '/x\\y', '/%2fother.test/', '/./admin/', '/api/run', 'https://other.test/'].entries())
    receive({ siteDir: '/a', revision: `invalid-${index}`, path });
  assert.equal(calls, 0); off?.();
  assert.equal(subscribeWorkspaceThemePreview({ bridge: { watchSitePreview: () => assert.fail('stopped subscription') }, siteDir: '/a', port: 4300, running: false, url: 'http://127.0.0.1:4300/', guest, dispatch: () => {} }), undefined);
});

test('delivery checks the actual guest URL even before React observes its navigation', () => {
  let url = 'http://127.0.0.1:4300/about';
  let receive!: (frame: SiteThemePreviewRefresh) => void;
  let calls = 0;
  const off = subscribeWorkspaceThemePreview({
    bridge: { watchSitePreview: ({ listener }) => { receive = listener; return () => {}; } },
    siteDir: '/a', port: 4300, running: true, url,
    guest: { getURL: () => url, reloadIgnoringCache: () => { calls++; }, loadURL: async () => { calls++; } }, dispatch: () => {},
  });
  url = 'http://127.0.0.1:4300/admin/'; receive({ siteDir: '/a', revision: 'admin' });
  url = 'http://127.0.0.1:4200/'; receive({ siteDir: '/a', revision: 'another-site' });
  assert.equal(calls, 0);
  url = 'http://127.0.0.1:4300/about'; receive({ siteDir: '/a', revision: 'own-site' });
  assert.equal(calls, 1); off?.();
});
