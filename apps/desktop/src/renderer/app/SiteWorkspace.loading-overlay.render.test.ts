/**
 * @file The first-content loading overlay of `SiteWorkspace`, rendered from its own module with the
 * real `useSiteWorkspace` over a fake desktop bridge, on the public Site view. The Admin view's
 * overlay, and the stall panel replacing it, are covered in `SiteWorkspace.render.test.ts`.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { act, dom, installBridge, mount, settle, site } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { SiteWorkspaces } from './SiteWorkspace.js';

after(closeHost);

// The overlay shows for both the Admin and Site views, so it must not call the site "the admin".
test('SiteWorkspace: switching to the Site view brings back one loading overlay, and it names the site', async (t) => {
  installBridge({ t, bridge: { onSiteHistory: () => () => {}, openSiteExternal: async () => {} } });
  const bakery = site('corner-bakery', { displayName: 'Corner Bakery', status: 'running', port: 4321 });
  const view = mount({ t, element: createElement(SiteWorkspaces, {
    openSites: [bakery], inSites: true, visibleWorkspaceId: bakery.id, expanded: false, adminPages: {},
    onToggleExpanded: () => {}, registerGuest: () => {}, registerZoomGuest: () => {}, onSiteUpdated: () => {},
  }) });
  await settle();
  await act(async () => { view.container.querySelector('webview')!.dispatchEvent(new dom.window.Event('did-finish-load')); });
  assert.equal(view.container.querySelector('.workspace__overlay'), null, 'the admin answered, so nothing covers it');
  await view.click(view.byText('Site'));
  assert.equal(view.container.querySelector('webview')?.getAttribute('src'), 'http://127.0.0.1:4321/');
  const overlays = view.all('.workspace__overlay');
  assert.equal(overlays.length, 1);
  assert.equal(overlays[0]!.className, 'workspace__overlay workspace__overlay--loading');
  assert.equal(overlays[0]!.getAttribute('role'), 'status');
  assert.equal(overlays[0]!.querySelector('p')?.textContent, 'Loading Corner Bakery…');
});
