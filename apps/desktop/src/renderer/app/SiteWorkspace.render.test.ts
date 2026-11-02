/**
 * @file `SiteWorkspaces` and the `SiteWorkspace`, `WorkspaceLoadingOverlay` and `ExpandToggle` it
 * renders, from their own module, with the real `useSiteWorkspace` over a fake desktop bridge:
 * which tab is on screen, the start panel for a site that is not up, the guest and its loading
 * overlay for one that is, the bar's buttons, and the stalled/failed recovery panels.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { act, dom, installBridge, mount, recordTelemetry, settle, site, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { SiteWorkspaces } from './SiteWorkspace.js';
import type { SiteRecord } from '../../contracts/project.js';
import type { RunnerInventoryBridge } from '../runner-api.js';
import type { SiteAdminPage } from '../import-site-entry.js';

after(closeHost);

const RUNNING = site('a', { status: 'running', port: 4100 });

interface Props {
  openSites?: readonly SiteRecord[];
  inSites?: boolean;
  visibleWorkspaceId?: string | null;
  expanded?: boolean;
  adminPages?: Readonly<Record<string, SiteAdminPage>>;
}

async function renderWorkspaces(t: TestContext, props: Props = {}, bridge: Partial<RunnerInventoryBridge> = {}) {
  const calls: string[] = [];
  installBridge({ t, bridge: {
    onSiteHistory: () => () => {},
    startSite: async (id) => { calls.push(`start:${id}`); return site(id, { status: 'running', port: 4100 }); },
    openSiteExternal: async ({ siteId, view }) => { calls.push(`external:${siteId}:${view}`); },
    ...bridge,
  } });
  const guests: [kind: string, id: string, node: unknown][] = [];
  const element = (next: Props = {}) => createElement(SiteWorkspaces, {
    openSites: [RUNNING], inSites: true, visibleWorkspaceId: 'a', expanded: false, adminPages: {},
    onToggleExpanded: () => { calls.push('toggle'); },
    registerGuest: (id, node) => { guests.push(['find', id, node]); },
    registerZoomGuest: (id, node) => { guests.push(['zoom', id, node]); },
    onSiteUpdated: (record) => { calls.push(`updated:${record.id}`); },
    ...props, ...next,
  });
  const view = mount({ t, element: element() });
  await settle();
  const shown = () => view.container.querySelector<HTMLElement>('.workspace:not(.is-hidden)');
  return { ...view, calls, guests, shown, rerender: (next: Props) => view.render(element(next)) };
}

test('SiteWorkspaces: only the visible workspace is on screen; the rest stay mounted but hidden', async (t) => {
  const view = await renderWorkspaces(t, { openSites: [site('a'), site('b')], visibleWorkspaceId: 'b' });
  const sections = view.all('section.workspace');
  assert.equal(sections.length, 2, 'every open site keeps its workspace mounted');
  assert.deepEqual(sections.map((section) => section.getAttribute('aria-hidden')), ['true', 'false']);
  assert.match(view.shown()?.textContent ?? '', /Site b/);
  view.rerender({ inSites: false });
  assert.equal(view.shown(), null, 'outside Websites every workspace is hidden');
  assert.equal(view.all('section.workspace').length, 2);
});

test('SiteWorkspace: a stopped site shows its start panel, and the bar disables what needs a server', async (t) => {
  const view = await renderWorkspaces(t, { openSites: [site('a')] });
  const workspace = view.shown()!;
  assert.equal(workspace.classList.contains('is-running'), false);
  assert.equal(workspace.querySelector('webview'), null);
  assert.equal(workspace.querySelector('.workspace__idle .empty__body')?.textContent, 'Stopped.');
  for (const label of ['Back', 'Forward', 'Reload']) assert.equal(view.byLabel(label)?.hasAttribute('disabled'), true, `${label} is disabled`);
  assert.equal(view.byText('Open in browser')?.hasAttribute('disabled'), true);
  await view.click(view.byText('Start site'));
  assert.deepEqual(view.calls, ['start:a', 'updated:a'], 'the tab\'s own Start hands main\'s record to the shared setter');
});

test('SiteWorkspace: a site attached to another app\'s server says it is connecting, then why the attach failed', async (t) => {
  let reject!: (error: Error) => void;
  const view = await renderWorkspaces(t, { openSites: [site('a', { externalUrl: 'http://127.0.0.1:5173/admin/' })] }, {
    startSite: () => new Promise<SiteRecord>((_resolve, fail) => { reject = fail; }),
  });
  assert.equal(view.container.querySelector('.workspace__idle .empty__body')?.textContent, 'Connecting to the server already running in the other app…');
  await act(async () => { reject(new Error('port 5173 is taken')); });
  await settle();
  assert.equal(view.container.querySelector('.workspace__idle .empty__body')?.textContent, 'port 5173 is taken');
});

test('SiteWorkspace: a running site mounts its guest on its own partition, registered for find and zoom, under a loading overlay', async (t) => {
  const view = await renderWorkspaces(t);
  const workspace = view.shown()!;
  assert.ok(workspace.classList.contains('is-running'));
  const guest = workspace.querySelector('webview')!;
  assert.equal(guest.getAttribute('src'), 'http://127.0.0.1:4100/admin/');
  assert.equal(guest.getAttribute('partition'), 'persist:a');
  assert.equal(guest.getAttribute('allowpopups'), '');
  assert.ok(view.guests.some(([kind, id, node]) => kind === 'find' && id === 'a' && node === guest));
  assert.ok(view.guests.some(([kind, id, node]) => kind === 'zoom' && id === 'a' && node === guest));
  const overlay = workspace.querySelector('.workspace__overlay--loading');
  assert.equal(overlay?.getAttribute('role'), 'status');
  assert.equal(overlay?.textContent, 'Loading Site a…');
  assert.ok(overlay?.querySelector('.spinner'));
  assert.equal(view.byLabel('Reload')?.hasAttribute('disabled'), false);
  await act(async () => { guest.dispatchEvent(new dom.window.Event('did-finish-load')); });
  assert.equal(workspace.querySelector('.workspace__overlay'), null, 'first content answered; the overlay goes');
});

test('SiteWorkspace: the view toggle switches surfaces and Open in browser opens the one on screen', async (t) => {
  const payloads = recordTelemetry({ t });
  const view = await renderWorkspaces(t);
  assert.deepEqual(view.all('.workspace__view').map((button) => [button.textContent, button.getAttribute('aria-pressed')]), [['Admin', 'true'], ['Site', 'false']]);
  await view.click(view.byText('Site'));
  assert.equal(view.byText('Site')?.getAttribute('aria-pressed'), 'true');
  assert.ok(view.byText('Site')?.classList.contains('is-on'));
  assert.equal(view.container.querySelector('webview')?.getAttribute('src'), 'http://127.0.0.1:4100/');
  await view.click(view.byText('Open in browser'));
  await view.click(view.byText('Admin'));
  await view.click(view.byText('Open in browser'));
  assert.deepEqual(view.calls, ['external:a:site', 'external:a:admin']);
  assert.deepEqual(payloads.map((payload) => (payload as { id: string }).id), ['open_preview', 'open_preview', 'open_admin', 'open_admin']);
});

test('ExpandToggle: names the move it makes, and reports a press', async (t) => {
  const view = await renderWorkspaces(t);
  const expand = view.byLabel('Expand to full window')!;
  assert.equal(expand.getAttribute('title'), 'Expand to full window');
  assert.equal(expand.getAttribute('aria-pressed'), 'false');
  await view.click(expand);
  assert.deepEqual(view.calls, ['toggle']);
  view.rerender({ expanded: true });
  const exit = view.byLabel('Exit full window')!;
  assert.equal(exit.getAttribute('title'), 'Exit full window (Esc)');
  assert.equal(exit.getAttribute('aria-pressed'), 'true');
});

test('SiteWorkspace: a tab opened on an admin page loads that page', async (t) => {
  const view = await renderWorkspaces(t, { adminPages: { a: 'import' } });
  assert.match(view.container.querySelector('webview')?.getAttribute('src') ?? '', /^http:\/\/127\.0\.0\.1:4100\/admin\/.*import/);
});

test('SiteWorkspace: a slow guest gets the stall panel over it; a failed one is replaced by a retry panel', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const view = await renderWorkspaces(t);
  act(() => t.mock.timers.tick(8000));
  await settle();
  const stalled = view.container.querySelector('.workspace__overlay:not(.workspace__overlay--loading)');
  assert.match(stalled?.textContent ?? '', /Site a is taking longer than usual to answer on port 4100\. It may still be starting\./);
  assert.equal(view.container.querySelector('.workspace__overlay--loading'), null, 'the stall overlay replaces the ordinary one');
  assert.ok(view.container.querySelector('webview'), 'a guess never unmounts the guest');
  const guest = view.container.querySelector('webview')!;
  await act(async () => { guest.dispatchEvent(Object.assign(new dom.window.Event('did-fail-load'), { isMainFrame: true, errorCode: -102 })); });
  await settle();
  assert.equal(view.container.querySelector('webview'), null);
  assert.equal(view.container.querySelector('.workspace__idle .empty__body')?.textContent, 'Site a isn\'t answering on port 4100. It may still be running, but stuck.');
  await view.click(view.byText('Start site'));
  assert.deepEqual(view.calls, ['start:a', 'updated:a']);
});
