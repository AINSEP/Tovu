import assert from 'node:assert/strict';
import test from 'node:test';
import { registerSiteThemePreviewIpc } from './site-theme-preview-ipc.ts';
import { createSiteThemePreviewBridge } from './contracts/site-theme-preview-bridge.ts';
import { SITE_THEME_PREVIEW_CHANNELS as channels } from './contracts/project.ts';

test('IPC claims are scoped to a trusted sender and tab; closing tabs or destroying windows releases them', () => {
  const handlers = new Map<string, Function>(), removed: string[] = [], deliveries: unknown[] = [];
  let claimed = 0, cleaned = 0;
  const sender = { id: 1, once: (_event: string, cb: () => void) => { destroyed = cb; }, removeListener: () => {}, isDestroyed: () => false, send: (_channel: string, frame: unknown) => deliveries.push(frame) };
  let destroyed = () => {};
  const dispose = registerSiteThemePreviewIpc({
    ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener); }, removeHandler: (channel) => { removed.push(channel); } },
    allowed: (source) => source === sender,
    subscriptions: { watch: ({ siteDir, listener }) => { claimed++; listener({ siteDir, revision: 'one' }); return () => { cleaned++; }; } },
  });
  const watch = handlers.get(channels.watch)!;
  watch({ sender }, { siteDir: '/a', subscriptionId: '1' });
  watch({ sender }, { siteDir: '/a', subscriptionId: '1' });
  assert.equal(claimed, 1);
  watch({ sender: { ...sender, id: 2 } }, { siteDir: '/b', subscriptionId: '1' });
  assert.equal(claimed, 1);
  assert.deepEqual(deliveries, [{ siteDir: '/a', revision: 'one' }]);
  handlers.get(channels.unwatch)!({ sender }, { subscriptionId: '1' });
  assert.equal(cleaned, 1);
  watch({ sender }, { siteDir: '/a', subscriptionId: '2' });
  destroyed(); assert.equal(cleaned, 2);
  dispose(); assert.deepEqual(removed, [channels.watch, channels.unwatch]);
});

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
