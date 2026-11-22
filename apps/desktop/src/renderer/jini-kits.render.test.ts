/**
 * @file The desktop's ui kit, mounted the way `main.tsx` mounts it. A ui secret input and ui's kit
 * hooks, placed below `UiKitProvider`, must reach ui-kit's real implementations: a masked field
 * whose eye toggle really shows and hides the value, and a real element to portal overlays into.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { SecretInput, UiKitProvider, useOverlayContainer, useSecretReveal } from '@jini-ai/ui/react-kit';
import { mount } from './app/component-harness.js';
import { closeHost } from './app-render-harness.js';
import { uiKit } from './jini-kits.js';

after(closeHost);

test("the desktop kit gives ui's secret input a masked field whose toggle shows and hides the value", async (t) => {
  const field = createElement(SecretInput, { label: 'API key', value: 'sk-test', readOnly: true });
  const view = mount({ t, element: createElement(UiKitProvider, { kit: uiKit, children: field }) });
  const input = () => view.container.querySelector('input');
  assert.equal(input()?.type, 'password', 'a secret starts hidden');
  assert.equal(input()?.value, 'sk-test');

  await view.click({ el: view.byLabel({ label: 'Show API key' }) });
  assert.equal(input()?.type, 'text');
  await view.click({ el: view.byLabel({ label: 'Hide API key' }) });
  assert.equal(input()?.type, 'password');
});

/** Reads both kit hooks through ui's own entry points, the way a ui select or secret field does. */
function HookProbe() {
  const reveal = useSecretReveal({ value: 'sk-test', labels: { show: 'Show token', hide: 'Hide token' } });
  const overlay = useOverlayContainer();
  return createElement('button', { 'aria-label': reveal.toggleLabel, 'data-input-type': reveal.inputType, 'data-overlay': overlay?.tagName ?? 'none', onClick: reveal.toggle });
}

test("ui's reveal and overlay hooks run the desktop kit's real ones", async (t) => {
  const view = mount({ t, element: createElement(UiKitProvider, { kit: uiKit, children: createElement(HookProbe) }) });
  const hidden = view.byLabel({ label: 'Show token' });
  assert.equal(hidden?.dataset.inputType, 'password');
  assert.equal(hidden?.dataset.overlay, 'BODY', 'with no kit overlay root, overlays portal into the page body');

  await view.click({ el: hidden });
  assert.equal(view.byLabel({ label: 'Hide token' })?.dataset.inputType, 'text');
});
