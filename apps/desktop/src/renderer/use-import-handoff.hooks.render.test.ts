/**
 * @file `useImportHandoff` rendered from its real module under jsdom: the web admin's "Open Import
 * in Tovu" (owner, 2026-11-10) opens the Import tab, typing in the address only when the Import
 * page's own `websiteAddress` accepts it and no import is running. The bridge lookup is injected.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import type { ImportHandoffRequest } from '../contracts/import-handoff.js';
import { renderHook } from './dom-hook-harness.js';
import { handoffAddress, useImportHandoff } from './use-import-handoff.hooks.js';

function fakeBridge() {
  const listeners = new Set<(request: ImportHandoffRequest) => void>();
  const getBridge = () => ({
    onOpenImport: (listener: (request: ImportHandoffRequest) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
  const fire = (request: unknown) => act(() => { for (const listener of listeners) listener(request as ImportHandoffRequest); });
  return { listeners, getBridge, fire };
}

function renderHandoff(t: Parameters<typeof renderHook>[0], { busy = false }: { busy?: boolean } = {}) {
  const bridge = fakeBridge();
  const calls: string[] = [];
  const hook = renderHook(t, () => useImportHandoff(
    { busy, prefill: (address) => calls.push(`prefill:${address}`), open: () => calls.push('open') },
    { getBridge: bridge.getBridge },
  ));
  return { ...bridge, calls, hook };
}

test('useImportHandoff: a valid address is typed in, then the Import tab opens', (t) => {
  const { fire, calls } = renderHandoff(t);
  fire({ address: 'example.com/about' });
  assert.deepEqual(calls, ['prefill:https://example.com/about', 'open']);
});

test('useImportHandoff: no address, or one the Import page would refuse, opens the tab without typing anything', (t) => {
  const { fire, calls } = renderHandoff(t);
  fire({});
  fire({ address: 'not an address' });
  fire({ address: 'ftp://example.com' });
  fire(null);
  assert.deepEqual(calls, ['open', 'open', 'open', 'open']);
});

test('useImportHandoff: while an import runs, the address it is using is left alone', (t) => {
  const { fire, calls } = renderHandoff(t, { busy: true });
  fire({ address: 'https://example.com' });
  assert.deepEqual(calls, ['open']);
});

test('useImportHandoff: subscribes once and detaches on unmount; without a bridge nothing subscribes', (t) => {
  const { listeners, hook } = renderHandoff(t);
  assert.equal(listeners.size, 1);
  hook.rerender();
  assert.equal(listeners.size, 1, 'a re-render does not add a second listener');
  hook.unmount();
  assert.equal(listeners.size, 0);
  const calls: string[] = [];
  renderHook(t, () => useImportHandoff({ busy: false, prefill: () => calls.push('prefill'), open: () => calls.push('open') }, { getBridge: () => undefined }));
  assert.deepEqual(calls, []);
});

test('handoffAddress: only a string the Import page accepts survives', () => {
  assert.equal(handoffAddress({ request: { address: 'https://example.com' } }), 'https://example.com/');
  assert.equal(handoffAddress({ request: { address: 'localhost' } }), null);
  assert.equal(handoffAddress({ request: { address: 7 } }), null);
  assert.equal(handoffAddress({ request: undefined }), null);
});
