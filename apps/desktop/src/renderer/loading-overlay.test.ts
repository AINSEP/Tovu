import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { elements, sourceFunction } from './source-test-harness.js';
import type { SiteRecord } from '../contracts/project.js';
import type { SiteWorkspace as WorkspaceState } from './use-site-workspace.hooks.js';

// The overlay shows for both the Admin and Site views, so it must not call the site "the admin".
test('the loading overlay on the Site view says "Loading <site>…"', () => {
  const project = {
    id: '/sites/corner-bakery', slug: 'corner-bakery', displayName: 'Corner Bakery',
    installDir: '/sites/corner-bakery', port: 4321, partition: 'persist:corner-bakery',
    templateId: 'blank', templateVersion: null, database: { kind: 'sqlite' },
    desiredState: 'running', status: 'running', statusDetail: null,
    deleteErasesFiles: false, previewVersion: null, folderMissing: false,
    createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z',
  } satisfies SiteRecord;
  const noop = () => {};
  const src = 'http://127.0.0.1:4321/';
  const workspace = {
    running: true, attachError: null, src, displayUrl: src, surface: 'site',
    history: { canGoBack: false, canGoForward: false }, reloadNonce: 0,
    failed: false, stalled: false, loaded: false, guestRef: noop,
    reload: noop, recover: noop, goBack: noop, goForward: noop,
    selectView: noop, openInBrowser: noop,
  } satisfies WorkspaceState;

  const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  const SiteWorkspace = sourceFunction(source, 'SiteWorkspace', {
    useSiteWorkspace: () => workspace,
    useComposedGuestRef: () => noop,
    SITE_SURFACES: ['admin', 'site'],
    NavIcon: () => null,
    ExpandToggle: sourceFunction(source, 'ExpandToggle'),
    Spinner: sourceFunction(source, 'Spinner'),
  });
  const overlays = elements(SiteWorkspace({
    project, hidden: false, expanded: false, onToggleExpanded: noop,
    registerGuest: noop, registerZoomGuest: noop, onSiteUpdated: noop,
  })).filter((element) => element.props.role === 'status');

  assert.equal(overlays.length, 1);
  assert.match(renderToStaticMarkup(overlays[0]), /<p>Loading Corner Bakery…<\/p>/);
});
