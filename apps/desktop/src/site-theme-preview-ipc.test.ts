import assert from 'node:assert/strict';
import test from 'node:test';
import { registerSiteThemePreviewIpc } from './site-theme-preview-ipc.ts';
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

test('IPC ignores untrusted, destroyed or malformed claims and never pushes to a destroyed sender', () => {
  const handlers = new Map<string, Function>(), deliveries: unknown[] = [], detached: string[] = [];
  let destroyed = false, claimed = 0, push!: (frame: { siteDir: string; revision: string }) => void;
  const sender = { id: 1, once: () => {}, removeListener: (event: string) => { detached.push(event); }, isDestroyed: () => destroyed, send: (_channel: string, frame: unknown) => deliveries.push(frame) };
  const stranger = { ...sender, id: 2 };
  registerSiteThemePreviewIpc({
    ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener); }, removeHandler: () => {} },
    allowed: (source) => source === sender,
    subscriptions: { watch: ({ listener }) => { claimed++; push = listener; return () => {}; } },
  });
  const watch = handlers.get(channels.watch)!, unwatch = handlers.get(channels.unwatch)!;
  for (const input of [undefined, 'x', {}, { siteDir: '/a' }, { subscriptionId: '1' }, { siteDir: 3, subscriptionId: '1' }, { siteDir: '/a', subscriptionId: 'bad id!' }, { siteDir: '/a', subscriptionId: 7 }]) {
    watch({ sender }, input);
  }
  watch({ sender: stranger }, { siteDir: '/a', subscriptionId: '1' });
  assert.equal(claimed, 0);
  // Unwatching an unknown sender or a malformed id is a no-op, not a throw.
  unwatch({ sender: stranger }, { subscriptionId: '1' });
  unwatch({ sender }, { subscriptionId: '../x' });
  unwatch({ sender }, null);
  watch({ sender }, { siteDir: '/a', subscriptionId: '1' });
  watch({ sender }, { siteDir: '/b', subscriptionId: '2' });
  assert.equal(claimed, 2);
  // One of two claims closed keeps the sender's destroy hook; the last one releases it.
  unwatch({ sender }, { subscriptionId: '1' });
  assert.deepEqual(detached, []);
  destroyed = true;
  push({ siteDir: '/b', revision: 'late' });
  assert.deepEqual(deliveries, []);
  watch({ sender }, { siteDir: '/c', subscriptionId: '3' });
  assert.equal(claimed, 2);
  unwatch({ sender }, { subscriptionId: '2' });
  assert.deepEqual(detached, ['destroyed']);
});
