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

test('SiteWorkspace: opening a sleeping site wakes once through startSite and uses the returned port', async t => {
  const view = await renderWorkspaces(t, { openSites: [site('a', { status: 'sleeping', port: 0 })] });
  assert.deepEqual(view.calls, ['start:a', 'updated:a']);
  view.rerender({ expanded: true });
  await settle();
  assert.deepEqual(view.calls, ['start:a', 'updated:a'], 'no repeated wake while awaiting the updated record');
  view.rerender({ openSites: [site('a', { status: 'running', port: 4200 })] });
  await settle();
  assert.equal(view.container.querySelector('webview')?.getAttribute('src'), 'http://127.0.0.1:4200/admin/');
});

test('SiteWorkspace: a hidden sleeping tab waits for focus; a failed wake is shown without a retry loop', async t => {
  let starts = 0;
  const view = await renderWorkspaces(t, { openSites: [site('a', { status: 'sleeping' })], visibleWorkspaceId: null }, {
    startSite: async () => { starts++; throw new Error('The server could not start.'); },
  });
  assert.equal(view.container.querySelector('.workspace__error'), null);
  assert.equal(starts, 0);
  view.rerender({ visibleWorkspaceId: 'a' });
  await settle();
  assert.equal(view.container.querySelector('.workspace__error')?.textContent, 'The server could not start.');
  assert.equal(view.byText('Wake site')?.hasAttribute('disabled'), false);
  assert.equal(starts, 1);
  view.rerender({ visibleWorkspaceId: null });
  view.rerender({ visibleWorkspaceId: 'a' });
  await settle();
  assert.equal(view.container.querySelector('.workspace__error')?.textContent, 'The server could not start.');
  assert.equal(starts, 1);
});

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

test('SiteWorkspaces: each open site\'s guest is on that site\'s own partition, never one shared jar', async (t) => {
  // Two sites both answering on 127.0.0.1 would otherwise share one cookie jar (cookies ignore the
  // port), and each open would overwrite the other's session. `openSites.map` hands every instance
  // its own `project`, and that same `project` is what the instance's guest reads `partition` from
  // — no lifted or module-level partition in between that could flatten them to one, and no
  // literal partition string that would give every tab the same session.
  // Both visited, so both keep a live guest under the default limit of two (`useLiveViews`).
  const view = await renderWorkspaces(t, { openSites: [RUNNING, site('b', { status: 'running', port: 4200 })] });
  view.rerender({ visibleWorkspaceId: 'b' });
  await settle();
  assert.deepEqual(view.all('webview').map((guest) => guest.getAttribute('partition')), ['persist:a', 'persist:b']);
});

test('SiteWorkspace: the bar reads history first, then the status dot and views, with the url pushed right beside Open in browser', async (t) => {
  const view = await renderWorkspaces(t);
  const bar = view.shown()!.querySelector('.workspace__bar')!;
  const name = (part: Element) => part.getAttribute('aria-label') ?? (part.tagName === 'BUTTON' ? part.textContent : part.classList[0]);
  assert.deepEqual([...bar.children].map(name), [
    'workspace__nav', 'state', 'workspace__views', 'workspace__spacer', 'workspace__url', 'Open in browser', 'Expand to full window',
  ]);
  const history = [...bar.querySelectorAll('.workspace__nav button')];
  assert.deepEqual(history.map((button) => [button.getAttribute('aria-label'), button.getAttribute('title')]), [
    ['Back', 'Back'], ['Forward', 'Forward'], ['Reload', 'Reload'],
  ], 'each icon-only button carries its own accessible name and tooltip');
  for (const button of history) {
    assert.equal(button.textContent, '', 'icon only: the text Reload button is gone');
    assert.ok(button.querySelector('svg.icon'), 'drawn inline, not from an icon package');
  }
  assert.equal(bar.querySelector('.workspace__url')?.textContent, 'http://127.0.0.1:4100/admin/');
});

test('SiteWorkspace: Back and Forward enable from the guest\'s live history and step that guest', async (t) => {
  const view = await renderWorkspaces(t);
  const guest = view.container.querySelector('webview')!;
  const calls: string[] = [];
  let history = { canGoBack: true, canGoForward: false };
  Object.assign(guest, {
    canGoBack: () => history.canGoBack,
    canGoForward: () => history.canGoForward,
    goBack: () => { calls.push('back'); },
    goForward: () => { calls.push('forward'); },
  });
  const navigate = (url: string) => act(async () => { guest.dispatchEvent(Object.assign(new dom.window.Event('did-navigate'), { url })); });
  await navigate('http://127.0.0.1:4100/admin/posts');
  assert.deepEqual([view.byLabel('Back')?.hasAttribute('disabled'), view.byLabel('Forward')?.hasAttribute('disabled')], [false, true]);
  assert.equal(view.shown()!.querySelector('.workspace__url')?.textContent, 'http://127.0.0.1:4100/admin/posts', 'the url follows the guest, not only the toggle');
  await view.click(view.byLabel('Back'));
  history = { canGoBack: false, canGoForward: true };
  await navigate('http://127.0.0.1:4100/admin/');
  assert.deepEqual([view.byLabel('Back')?.hasAttribute('disabled'), view.byLabel('Forward')?.hasAttribute('disabled')], [true, false]);
  await view.click(view.byLabel('Forward'));
  assert.deepEqual(calls, ['back', 'forward']);
});

test('SiteWorkspace: Reload on a healthy guest reloads that same guest past the cache, and shows its loading state again', async (t) => {
  const view = await renderWorkspaces(t);
  const guest = view.container.querySelector('webview')!;
  const calls: string[] = [];
  Object.assign(guest, { reloadIgnoringCache: () => { calls.push('reload'); } });
  await act(async () => { guest.dispatchEvent(new dom.window.Event('did-finish-load')); });
  assert.equal(view.container.querySelector('.workspace__overlay--loading'), null);
  await view.click(view.byLabel('Reload'));
  assert.deepEqual(calls, ['reload']);
  assert.equal(view.container.querySelector('webview'), guest, 'not a remount: the guest, and with it its history, survives');
  // The load-failure state resets on soft loads as well as remounts (`loadResetKey`), so a reload
  // is a fresh load that has not finished yet.
  assert.ok(view.container.querySelector('.workspace__overlay--loading'));
});

test('SiteWorkspace: both recovery panels retry by remounting the guest, and the new guest is still listened to', async (t) => {
  // The remount survives only as recovery: `key` on the guest is bumped by the stall panel's and
  // the failure panel's "Start site" alike. The failure panel's retry is one of the two ordinary
  // paths that mount a guest D-03 left unlistened (see `useWebviewLoadFailure`'s doc), so the
  // remounted guest's own failure must still be heard.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const view = await renderWorkspaces(t);
  const first = view.container.querySelector('webview')!;
  act(() => t.mock.timers.tick(8000));
  await settle();
  await view.click(view.byText('Start site'));
  const second = view.container.querySelector('webview')!;
  assert.ok(second && second !== first, 'the stall panel\'s retry remounts the guest');
  assert.ok(view.container.querySelector('.workspace__overlay--loading'), 'the stall is withdrawn for the fresh guest');
  const fail = (guest: Element) => act(async () => { guest.dispatchEvent(Object.assign(new dom.window.Event('did-fail-load'), { isMainFrame: true, errorCode: -102 })); });
  await fail(second);
  await settle();
  assert.equal(view.container.querySelector('webview'), null);
  await view.click(view.byText('Start site'));
  const third = view.container.querySelector('webview')!;
  assert.ok(third && third !== second, 'the failure panel\'s retry mounts a new guest');
  await fail(third);
  await settle();
  assert.equal(view.container.querySelector('webview'), null, 'the remounted guest\'s failure is heard');
  assert.deepEqual(view.calls, ['start:a', 'updated:a', 'start:a', 'updated:a']);
});

test('SiteWorkspace: a guest that mounts late, when a stopped tab\'s site comes up, is still listened to', async (t) => {
  // D-03: a stopped tab whose site flips to running mounts its guest in a LATER render. The
  // listeners are keyed on the node the callback ref hands over, so they attach to it then; a
  // ref object would have stayed the same and left this guest with no failure listener at all.
  const view = await renderWorkspaces(t, { openSites: [site('a')] });
  assert.equal(view.container.querySelector('webview'), null);
  view.rerender({ openSites: [RUNNING] });
  await settle();
  const guest = view.container.querySelector('webview')!;
  assert.ok(guest);
  await act(async () => { guest.dispatchEvent(Object.assign(new dom.window.Event('did-fail-load'), { isMainFrame: true, errorCode: -102 })); });
  await settle();
  assert.equal(view.container.querySelector('webview'), null);
  assert.equal(view.container.querySelector('.workspace__idle .empty__body')?.textContent, 'Site a isn\'t answering on port 4100. It may still be running, but stuck.');
});
