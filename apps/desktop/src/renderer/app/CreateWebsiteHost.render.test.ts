/**
 * @file `CreateWebsiteHost` rendered from its own module around the real `CreateWebsiteOnboarding`:
 * hidden is CSS plus `aria-hidden`, never an unmount, and the form inside reaches `onBack` and
 * `onCreate`.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { act, dom, installBridge, mount, settle, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { CreateWebsiteHost } from './CreateWebsiteHost.js';
import type { CreateSiteInput } from '../../contracts/project.js';

after(closeHost);

function renderHost(t: TestContext, hidden: boolean) {
  installBridge({ t, bridge: {} });
  const created: CreateSiteInput[] = [];
  let backs = 0;
  const element = (nextHidden: boolean) => createElement(CreateWebsiteHost, {
    hidden: nextHidden, onBack: () => { backs++; }, onCreate: async (input) => { created.push(input); },
  });
  const view = mount({ t, element: element(hidden) });
  const host = () => view.container.querySelector<HTMLElement>('.create-website-host')!;
  return { ...view, created, backs: () => backs, host, setHidden: (next: boolean) => view.render(element(next)) };
}

test('CreateWebsiteHost: hidden is a class and aria-hidden on a host that stays mounted', (t) => {
  const view = renderHost(t, true);
  assert.ok(view.host().classList.contains('is-hidden'));
  assert.equal(view.host().getAttribute('aria-hidden'), 'true');
  const form = view.host().querySelector('form');
  assert.ok(form, 'the form is mounted even while hidden');
  view.setHidden(false);
  assert.equal(view.host().classList.contains('is-hidden'), false);
  assert.equal(view.host().getAttribute('aria-hidden'), 'false');
  assert.equal(view.host().querySelector('form'), form, 'showing it again reuses the same form, so nothing typed is lost');
});

test('CreateWebsiteHost: the form\'s Cancel goes back and a submitted name is created', async (t) => {
  const view = renderHost(t, false);
  await view.click(view.all('.create-website-host button').find((button) => /^cancel$/i.test(button.textContent?.trim() ?? '')));
  assert.equal(view.backs(), 1);
  const name = view.host().querySelector<HTMLInputElement>('input[type="text"], input:not([type])')!;
  await view.type(name, 'New site');
  await act(async () => { view.host().querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
  await settle();
  assert.equal(view.created.length, 1);
  assert.match(JSON.stringify(view.created[0]), /New site/);
});
