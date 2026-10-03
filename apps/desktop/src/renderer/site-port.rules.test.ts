import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { sitePortPresentation } from './site-port.rules.js';
import { cardOpenProps, databaseLabel, deleteActionCopy, isCardOpenable } from './SiteGrid.hooks.js';
import { STATUS_LABEL } from './site-status.js';
import { sourceFunction } from './source-test-harness.js';
import {
  createWorkspaceActions, initialSiteWorkspaceState, loadResetKey, siteSurfaceUrl, surfaceOfUrl,
} from './use-site-workspace.hooks.js';

// REGRESSION: fails if sitePortPresentation accepts port 0 or an absent port as running.
test('zero, absent and invalid ports have no address or port number', () => {
  for (const port of [0, undefined, null, -1, NaN, Infinity, 4100.5, 65536]) {
    assert.deepEqual(sitePortPresentation({ port }), {
      running: false, portLabel: '', origin: '', statusDescription: 'Stopped.',
    });
  }
});

// PARITY: a running site's real loopback port remains visible, including the valid bounds.
test('running sites retain their port, origin and lifecycle copy', () => {
  for (const port of [1, 4100, 65535]) {
    assert.deepEqual(sitePortPresentation({ port, status: 'running' }), {
      running: true, portLabel: String(port), origin: `http://127.0.0.1:${port}`,
      statusDescription: `Running on port ${port}.`,
    });
  }
});

// REGRESSION: fails if sitePortPresentation ignores the lifecycle status when a stale port exists.
test('non-running lifecycle states never advertise a stale port', () => {
  for (const status of ['provisioning', 'starting', 'stopping', 'stopped', 'failed', 'blocked'] as const) {
    const connection = sitePortPresentation({ port: 4100, status });
    assert.equal(connection.running, false);
    assert.equal(connection.portLabel, '');
    assert.equal(connection.origin, '');
    assert.equal(connection.statusDescription, `${STATUS_LABEL[status]}.`);
  }
});

const gridSource = fs.readFileSync(new URL('./SiteGrid.tsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const workspaceSource = fs.readFileSync(new URL('./use-site-workspace.hooks.ts', import.meta.url), 'utf8');

// REGRESSION: fails if SiteCard renders project.port instead of connection.portLabel.
test('the rendered card keeps the running port and blanks the stopped port', () => {
  const SiteCard = sourceFunction(gridSource, 'SiteCard', {
    cardOpenProps, databaseLabel, deleteActionCopy, isCardOpenable, STATUS_LABEL, sitePortPresentation,
    useSitePreview: () => null, CardActions: () => null, MissingFolderNotice: () => null,
  });
  for (const [status, port, expected] of [
    ['stopped', 0, ''], ['stopped', 4100, ''], ['running', 0, ''],
    ['stopped', undefined, ''], ['running', 4100, '4100'],
  ] as const) {
    const tree = SiteCard({
      project: { id: 'test-site', displayName: 'Test site', status, port, database: { kind: 'sqlite' } },
      overlay: null, power: { statusOf: () => status, errorOf: () => null },
    });
    assert.ok(renderToStaticMarkup(tree).includes(`<span class="card__port">${expected}</span>`));
  }
});

// REGRESSION: fails if SiteStartPanel restores `${STATUS_LABEL[project.status]} on port ${project.port}.`.
test('the rendered stopped panel says Stopped without port 0', () => {
  const SiteStartPanel = sourceFunction(appSource, 'SiteStartPanel', {
    sitePortPresentation,
    useSiteStart: () => ({ starting: false, error: null, start: () => Promise.resolve(true) }),
    startThenNotify: () => () => Promise.resolve(),
  });
  for (const port of [0, undefined]) {
    const html = renderToStaticMarkup(SiteStartPanel({
      project: { id: 'test-site', displayName: 'Test site', status: 'stopped', port },
    }));
    assert.ok(html.includes('<p class="empty__body">Stopped.</p>'));
    assert.equal(html.includes('on port'), false);
  }
});

// REGRESSION: fails if useSiteWorkspace restores `displayUrl: state.liveUrl ?? src`.
test('stopping a tab blanks its URL immediately even while the last guest URL is remembered', () => {
  const state = { ...initialSiteWorkspaceState, liveUrl: 'http://127.0.0.1:4100/admin/posts' };
  const useSiteWorkspace = sourceFunction(workspaceSource, 'useSiteWorkspace', {
    useReducer: () => [state, () => {}], useEffect: () => {},
    useWebviewLoadFailure: () => ({ guest: null, guestRef: () => {}, failed: false, stalled: false, loaded: false }),
    runnerInventoryBridge: () => undefined,
    initialSiteWorkspaceState, loadResetKey, siteSurfaceUrl, createWorkspaceActions,
    liveSurface: sourceFunction(workspaceSource, 'liveSurface', { surfaceOfUrl }),
  });
  const running = useSiteWorkspace({ id: 'test-site', port: 4100, status: 'running' }, false);
  assert.equal(running.displayUrl, state.liveUrl);
  assert.equal(running.running, true);
  for (const [port, status] of [[0, 'stopped'], [undefined, 'stopped'], [4100, 'stopped'], [0, 'running']] as const) {
    const stopped = useSiteWorkspace({ id: 'test-site', port, status }, false);
    assert.equal(stopped.src, '');
    assert.equal(stopped.displayUrl, '');
    assert.equal(stopped.running, false);
  }
});
