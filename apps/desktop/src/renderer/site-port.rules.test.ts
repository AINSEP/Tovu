import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { siteCardStatus, sitePortPresentation } from './site-port.rules.js';
import { cardOpenClass, cardOpenProps, databaseLabel, deleteActionCopy, isCardOpenable } from './SiteGrid.hooks.js';
import { STATUS_LABEL } from './site-status.js';
import { ResourceSiteFigure } from './ResourcesPanel.js';
import { sourceFunction } from './source-test-harness.js';
import {
  createWorkspaceActions, initialSiteWorkspaceState, loadResetKey, siteSurfaceUrl, siteWorkspaceReducer, surfaceOfUrl,
} from './use-site-workspace.hooks.js';

// The real ResourcesPanel.tsx compiles to classic JSX under the bare tsx runner (same as ResourcesPanel.render.test.ts).
Object.assign(globalThis, { React });

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

// REGRESSION: owner 2026-10-13 — the card's copy never shows the port; it lives in the status title.
test('the rendered card keeps the running address in the status title, never in its copy', () => {
  const SiteCard = sourceFunction(gridSource, 'SiteCard', {
    cardOpenClass, cardOpenProps, databaseLabel, deleteActionCopy, isCardOpenable, STATUS_LABEL, sitePortPresentation, siteCardStatus, ResourceSiteFigure,
    CardOverlays: sourceFunction(gridSource, 'CardOverlays'),
    useSitePreview: () => null, CardActions: () => null, SiteCardMenu: () => null, MissingFolderNotice: () => null,
  });
  for (const [status, port, title] of [
    ['stopped', 0, 'Stopped.'], ['stopped', 4100, 'Stopped.'], ['running', 0, 'Stopped.'],
    ['stopped', undefined, 'Stopped.'], ['running', 4100, 'Running at http://localhost:4100'],
  ] as const) {
    const tree = SiteCard({
      project: { id: 'test-site', displayName: 'Test site', installDir: '/sites/test-site', status, port, database: { kind: 'sqlite' } },
      overlay: null, power: { statusOf: () => status, errorOf: () => null },
    });
    const html = renderToStaticMarkup(tree);
    assert.ok(html.includes(`<span class="state" title="${title}">`), html);
    assert.ok(!html.includes('4100<') && !html.includes('card__port'), `${status}/${port} must not print the port`);
  }
});

test('siteCardStatus names the running app in the title and drops its detail line', () => {
  const running = sitePortPresentation({ port: 3000, status: 'running' });
  assert.deepEqual(siteCardStatus({ project: { runningApp: 'Web', statusDetail: 'Running in Web (port 3000)' }, connection: running }), {
    title: 'Running in Web at http://localhost:3000', detail: null,
  });
  const starting = sitePortPresentation({ port: 0, status: 'starting' });
  assert.deepEqual(siteCardStatus({ project: { runningApp: 'Web', statusDetail: 'Running in Web (starting)' }, connection: starting }), {
    title: 'Starting.', detail: null,
  });
  // A stopped site's last exit is the one detail that stays visible.
  const stopped = sitePortPresentation({ port: 0, status: 'stopped' });
  assert.deepEqual(siteCardStatus({ project: { statusDetail: "The site's server exited (code 1)." }, connection: stopped }), {
    title: 'Stopped.', detail: "The site's server exited (code 1).",
  });
  assert.deepEqual(siteCardStatus({ project: {}, connection: stopped }), { title: 'Stopped.', detail: null });
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
    useReducer: () => [state, () => {}], useEffect: () => {}, useState: (initial: unknown) => [initial, () => {}],
    useWebviewLoadFailure: () => ({ guest: null, guestRef: () => {}, failed: false, stalled: false, loaded: false }),
    runnerInventoryBridge: () => undefined,
    initialSiteWorkspaceState, siteWorkspaceReducer, loadResetKey, siteSurfaceUrl, createWorkspaceActions,
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
