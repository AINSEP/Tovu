import assert from 'node:assert/strict';
import test from 'node:test';
import { createSiteThemePreviewBridge } from './site-theme-preview-bridge.js';
import { SITE_THEME_PREVIEW_CHANNELS as channels } from './project.js';

// Runs under tsx with the other contracts tests: the bridge's './project.js' import is for the
// compiled preload, and plain node type-stripping (the main-process runner) cannot resolve it.

test('preload bridge uses fixed IPC channels, strips Electron event, and tears down its listener and claim', async () => {
  const invokes: unknown[] = [], frames: unknown[] = [];
  let receive!: (frame: { siteDir: string; revision: string }) => void, detached = false;
  const watch = createSiteThemePreviewBridge({
    invoke: async (channel, input) => { invokes.push([channel, input]); },
    subscribe: (_channel, listener) => { receive = listener; return () => { detached = true; }; },
  });
  const off = watch({ siteDir: '/a', listener: (frame) => frames.push(frame) });
  const id = (invokes[0] as [string, { subscriptionId: string }])[1].subscriptionId;
  assert.deepEqual(invokes[0], [channels.watch, { siteDir: '/a', subscriptionId: id }]);
  receive({ siteDir: '/a', revision: 'one' }); assert.equal(frames.length, 1);
  off(); off();
  assert.equal(detached, true);
  assert.deepEqual(invokes[1], [channels.unwatch, { subscriptionId: id }]);
  assert.equal(invokes.length, 2);
  receive({ siteDir: '/a', revision: 'late' }); assert.equal(frames.length, 1);
  await Promise.resolve();
});
