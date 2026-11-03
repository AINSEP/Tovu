/**
 * @file Live site views (`use-live-views.hooks.ts`) as the operator meets them: `SiteWorkspaces`
 * rendered from its own module with the real hooks over a fake desktop bridge. Each `<webview>`
 * answers `executeJavaScript` through a stand-in on the element prototype, keyed by the guest's
 * own partition, so a test decides which hidden site agrees to be released. The release probe
 * itself also runs for real against jsdom's `window`, with the same listeners a dirty guard and the
 * composer register.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { act, dom, installBridge, mount, settle, site, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { SiteWorkspaces } from './SiteWorkspace.js';
import { RELEASE_PROBE } from '../use-live-views.hooks.js';
import type { SiteRecord } from '../../contracts/project.js';
import type { RunnerInventoryBridge } from '../runner-api.js';

after(closeHost);

const IDS = ['a', 'b', 'c', 'd', 'e'] as const;
const running = (id: string, index: number) => site(id, { status: 'running', port: 4101 + index });
const SITES: readonly SiteRecord[] = IDS.map(running);

type Reply = { release: boolean; url?: string; x?: number; y?: number; innerY?: number };

/**
 * Every guest's `executeJavaScript`. A site with no entry in `replies` agrees and reports its own
 * `src`. Calls are recorded as [site id, script] so a test can see the probe and the scroll restore.
 */
function fakeGuests(t: TestContext) {
  const replies: Record<string, Reply> = {};
  const scripts: [id: string, code: string][] = [];
  const proto = dom.window.HTMLElement.prototype as unknown as { executeJavaScript?: (this: Element, code: string) => Promise<unknown> };
  proto.executeJavaScript = async function executeJavaScript(this: Element, code: string) {
    const id = (this.getAttribute('partition') ?? '').replace('persist:', '');
    scripts.push([id, code]);
    if (code !== RELEASE_PROBE) return undefined;
    return replies[id] ?? { release: true, url: this.getAttribute('src'), x: 0, y: 0, innerY: 0 };
  };
  t.after(() => { delete proto.executeJavaScript; });
  return { replies, scripts };
}

async function renderTabs(t: TestContext, { openSites = SITES, bridge = {} }: { openSites?: readonly SiteRecord[]; bridge?: Partial<RunnerInventoryBridge> } = {}) {
  // Two, not the shipped default of one, so the release mechanics below have a hidden guest to keep.
  installBridge({ t, bridge: { onSiteHistory: () => () => {}, openSiteExternal: async () => {}, getMaximumLiveSiteViews: async () => 2, ...bridge } });
  const guests = fakeGuests(t);
  let props = { inSites: true, visibleWorkspaceId: openSites[0]!.id as string | null };
  const element = () => createElement(SiteWorkspaces, {
    openSites, expanded: false, adminPages: {}, ...props,
    onToggleExpanded: () => {}, registerGuest: () => {}, registerZoomGuest: () => {}, onSiteUpdated: () => {},
  });
  const view = mount({ t, element: element() });
  await settle();
  const mounted = () => view.all('webview').map((guest) => guest.getAttribute('partition')!.replace('persist:', '')).sort();
  const guestOf = (id: string) => view.container.querySelector<HTMLElement>(`webview[partition="persist:${id}"]`);
  const show = async (next: Partial<typeof props>) => { props = { ...props, ...next }; view.render(element()); await settle(); };
  const visit = (id: string) => show({ visibleWorkspaceId: id, inSites: true });
  return { ...view, ...guests, mounted, guestOf, show, visit };
}

test('live views: five visited clean tabs keep at most two guests, the two most recently focused', async (t) => {
  const view = await renderTabs(t);
  assert.deepEqual(view.mounted(), ['a'], 'a tab never focused mounts nothing');
  for (const id of IDS.slice(1)) {
    await view.visit(id);
    assert.ok(view.mounted().length <= 2, `after visiting ${id}: ${view.mounted().join(', ')}`);
  }
  assert.deepEqual(view.mounted(), ['d', 'e']);
  assert.equal(view.all('section.workspace').length, 5, 'every workspace, released or not, keeps its bar');
  assert.deepEqual(view.scripts.map(([id]) => id), ['a', 'b', 'c'], 'each release asked the least recently focused guest first');
});

test('live views: a hidden guest that vetoes keeps its guest, the focused tab mounts anyway, and the next focus change retries', async (t) => {
  const view = await renderTabs(t, { openSites: SITES.slice(0, 3) });
  view.replies.a = { release: false };
  view.replies.b = { release: false };
  await view.visit('b');
  await view.visit('c');
  assert.deepEqual(view.mounted(), ['a', 'b', 'c'], 'every hidden guest said no, so the shell stays over the limit');
  view.replies.a = { release: true, url: 'http://127.0.0.1:4101/admin/' };
  await view.show({ inSites: false });
  assert.deepEqual(view.mounted(), ['b', 'c'], 'leaving Websites is a focus change: the oldest guest now agrees and goes');
});

test('live views: a guest that throws or never answers is kept', async (t) => {
  const view = await renderTabs(t, { openSites: SITES.slice(0, 3) });
  const proto = dom.window.HTMLElement.prototype as unknown as { executeJavaScript: (this: Element, code: string) => Promise<unknown> };
  const answer = proto.executeJavaScript;
  proto.executeJavaScript = function executeJavaScript(this: Element, code: string) {
    if (this.getAttribute('partition') === 'persist:a') throw new Error('The WebView must be attached to the DOM');
    if (this.getAttribute('partition') === 'persist:b') return new Promise(() => {});
    return answer.call(this, code);
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await view.visit('b');
  await view.visit('c');
  await act(async () => { t.mock.timers.tick(2000); });
  await settle();
  assert.deepEqual(view.mounted(), ['a', 'b', 'c']);
});

test('live views: focusing a released tab brings it back on its last route, then puts its scroll back once it loads', async (t) => {
  const view = await renderTabs(t, { openSites: SITES.slice(0, 3) });
  view.replies.a = { release: true, url: 'http://127.0.0.1:4101/admin/posts?page=2', x: 0, y: 40, innerY: 640 };
  await view.visit('b');
  await view.visit('c');
  assert.equal(view.guestOf('a'), null, 'a was released');
  await view.visit('a');
  const guest = view.guestOf('a')!;
  assert.equal(guest.getAttribute('src'), 'http://127.0.0.1:4101/admin/posts?page=2');
  assert.equal(view.container.querySelector('.workspace:not(.is-hidden) .workspace__url')?.textContent, 'http://127.0.0.1:4101/admin/posts?page=2');
  assert.equal(view.scripts.filter(([id, code]) => id === 'a' && code !== RELEASE_PROBE).length, 0, 'no scroll before the page has loaded');
  await act(async () => { guest.dispatchEvent(new dom.window.Event('did-finish-load')); });
  await act(async () => { guest.dispatchEvent(new dom.window.Event('did-finish-load')); });
  const restores = view.scripts.filter(([id, code]) => id === 'a' && code !== RELEASE_PROBE).map(([, code]) => code);
  assert.equal(restores.length, 1, 'once per restored guest: a later reload is the operator\'s own');
  assert.match(restores[0]!, /window\.scrollTo\(0, 40\)/);
  assert.match(restores[0]!, /\.admin-content/);
  assert.match(restores[0]!, /scrollTop = 640/);
});

test('live views: the menu\'s limit is read from the bridge, and a change applies at once', async (t) => {
  let changed: ((maximum: number) => void) | undefined;
  const view = await renderTabs(t, { bridge: {
    getMaximumLiveSiteViews: async () => 3,
    onMaximumLiveSiteViewsChanged: (listener) => { changed = listener; return () => { changed = undefined; }; },
  } });
  for (const id of IDS.slice(1)) await view.visit(id);
  assert.deepEqual(view.mounted(), ['c', 'd', 'e']);
  await act(async () => { changed!(2); });
  await settle();
  assert.deepEqual(view.mounted(), ['d', 'e'], 'lowering the limit releases at once, never the tab on screen');
  await act(async () => { changed!(0); });
  await settle();
  assert.deepEqual(view.mounted(), ['e'], 'a nonsense limit falls back to the default of 1');
});

test('live views: an older preload with no saved limit keeps one loaded site, the one on screen', async (t) => {
  const view = await renderTabs(t, { openSites: SITES.slice(0, 3), bridge: { getMaximumLiveSiteViews: undefined } });
  await view.visit('b');
  assert.deepEqual(view.mounted(), ['b']);
  await view.visit('c');
  assert.deepEqual(view.mounted(), ['c']);
});

test('live views: closing a tab forgets its released route', async (t) => {
  const view = await renderTabs(t, { openSites: SITES.slice(0, 3) });
  view.replies.a = { release: true, url: 'http://127.0.0.1:4101/admin/posts' };
  await view.visit('b');
  await view.visit('c');
  const reopened = SITES.slice(0, 3);
  view.render(createElement(SiteWorkspaces, {
    openSites: SITES.slice(1, 3), inSites: true, visibleWorkspaceId: 'c', expanded: false, adminPages: {},
    onToggleExpanded: () => {}, registerGuest: () => {}, registerZoomGuest: () => {}, onSiteUpdated: () => {},
  }));
  await settle();
  view.render(createElement(SiteWorkspaces, {
    openSites: reopened, inSites: true, visibleWorkspaceId: 'a', expanded: false, adminPages: {},
    onToggleExpanded: () => {}, registerGuest: () => {}, registerZoomGuest: () => {}, onSiteUpdated: () => {},
  }));
  await settle();
  assert.equal(view.guestOf('a')?.getAttribute('src'), 'http://127.0.0.1:4101/admin/', 'a reopened tab starts on its admin root');
});

// The probe as it runs in a guest, against a real DOM `window`: what each guard does to its answer.
function runProbe(t: TestContext, listeners: Record<string, (event: Event) => void>) {
  for (const [type, listener] of Object.entries(listeners)) {
    dom.window.addEventListener(type, listener);
    t.after(() => dom.window.removeEventListener(type, listener));
  }
  return runInNewContext(RELEASE_PROBE, { window: dom.window, document: dom.window.document }) as Reply;
}

test('release probe: an editor\'s beforeunload guard says no', (t) => {
  assert.equal(runProbe(t, { beforeunload: (event) => { event.preventDefault(); } }).release, false);
});

test('release probe: a jini:release-check veto says no', (t) => {
  assert.equal(runProbe(t, { 'jini:release-check': (event) => { event.preventDefault(); } }).release, false);
});

test('release probe: with no guard objecting it says yes, with the page url and scroll', (t) => {
  dom.window.history.replaceState(null, '', '/admin/');
  t.after(() => dom.window.history.replaceState(null, '', '/'));
  const answer = runProbe(t, { 'jini:release-check': () => {} });
  assert.equal(answer.release, true);
  assert.equal(answer.url, 'http://localhost/admin/');
  assert.deepEqual([answer.x, answer.y, answer.innerY], [0, 0, 0]);
});

test('release probe: an unsent public comment survives switching sites without a release listener', t => {
  const form = dom.window.document.createElement('form');
  form.action = '/api/site/comments';
  form.innerHTML = '<textarea name="body" required maxlength="10000"></textarea>';
  dom.window.document.body.append(form);
  t.after(() => form.remove());
  const comment = form.querySelector('textarea')!;
  comment.value = 'My unfinished comment';
  assert.equal(runProbe(t, {}).release, false);
  assert.equal(comment.value, 'My unfinished comment');
});
