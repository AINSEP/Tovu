/**
 * @file `useSiteWorkspace` rendered from its real module under jsdom (see `dom-hook-harness.ts`):
 * a tab whose site stops shows no url at once, even though the guest's last url is still remembered.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { act } from 'react';

import type { SiteRecord } from '../contracts/project.js';
import { installDom, renderHook } from './dom-hook-harness.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { useSiteWorkspace } from './use-site-workspace.hooks.js';

const OWN = { id: '/sites/a', installDir: '/sites/a', port: 4100, status: 'running' } as unknown as SiteRecord;

/** Only the history subscription an own, visible site makes; nothing here starts or attaches. */
const bridge = { onSiteHistory: () => () => {} } as unknown as RunnerInventoryBridge;
const getBridge = () => bridge;

// REGRESSION: fails if useSiteWorkspace restores `displayUrl: state.liveUrl ?? src`.
test('stopping a tab blanks its url at once, even while the last guest url is remembered', (t) => {
  let project = OWN;
  const hook = renderHook(t, () => useSiteWorkspace(project, false, { getBridge }));
  const window = installDom();
  const guest = Object.assign(window.document.createElement('webview'), {
    canGoBack: () => false,
    canGoForward: () => false,
  }) as unknown as HTMLWebViewElement;
  act(() => hook.current().guestRef(guest));
  act(() => { guest.dispatchEvent(Object.assign(new window.Event('did-navigate'), { url: 'http://127.0.0.1:4100/admin/posts' })); });
  assert.equal(hook.current().displayUrl, 'http://127.0.0.1:4100/admin/posts');
  assert.equal(hook.current().running, true);

  // The guest stays attached, so the workspace still remembers where it last was.
  for (const [port, status] of [[0, 'stopped'], [undefined, 'stopped'], [4100, 'stopped'], [0, 'running']] as const) {
    project = { ...OWN, port, status } as SiteRecord;
    hook.rerender();
    assert.equal(hook.current().src, '', `${status} on port ${port}`);
    assert.equal(hook.current().displayUrl, '', `${status} on port ${port}`);
    assert.equal(hook.current().running, false, `${status} on port ${port}`);
  }
});
