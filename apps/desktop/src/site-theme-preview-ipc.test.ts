import assert from 'node:assert/strict';
import test from 'node:test';
import { registerSiteThemePreviewIpc } from './site-theme-preview-ipc.ts';
import { SITE_THEME_PREVIEW_CHANNELS as channels } from './contracts/project.ts';

/** A handler called the way Electron calls it from the sender's own main frame. */
const fromMainFrame = (handler: Function) => (event: { sender: { getURL: () => string; [key: string]: unknown } }, input: unknown) =>
  handler({ ...event, senderFrame: { url: event.sender.getURL(), parent: null } }, input);

test('IPC claims are scoped to a trusted sender and tab; closing tabs or destroying windows releases them', () => {
  const handlers = new Map<string, Function>(), removed: string[] = [], deliveries: unknown[] = [];
  let claimed = 0, cleaned = 0;
  const sender = { id: 1, getURL: () => 'file:///sites-home.html', once: (_event: string, cb: () => void) => { destroyed = cb; }, removeListener: () => {}, isDestroyed: () => false, send: (_channel: string, frame: unknown) => deliveries.push(frame) };
  let destroyed = () => {};
  const dispose = registerSiteThemePreviewIpc({
    ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener); }, removeHandler: (channel) => { removed.push(channel); } },
    allowed: ({ sender: source }) => source === sender,
    subscriptions: { watch: ({ siteDir, listener }) => { claimed++; listener({ frame: { siteDir, revision: 'one' } }); return () => { cleaned++; }; } },
  });
  const watch = fromMainFrame(handlers.get(channels.watch)!);
  watch({ sender }, { siteDir: '/a', subscriptionId: '1' });
  watch({ sender }, { siteDir: '/a', subscriptionId: '1' });
  assert.equal(claimed, 1);
  watch({ sender: { ...sender, id: 2 } }, { siteDir: '/b', subscriptionId: '1' });
  assert.equal(claimed, 1);
  assert.deepEqual(deliveries, [{ siteDir: '/a', revision: 'one' }]);
  fromMainFrame(handlers.get(channels.unwatch)!)({ sender }, { subscriptionId: '1' });
  assert.equal(cleaned, 1);
  watch({ sender }, { siteDir: '/a', subscriptionId: '2' });
  destroyed(); assert.equal(cleaned, 2);
  dispose(); assert.deepEqual(removed, [channels.watch, channels.unwatch]);
});

test('disposing releases every live claim of every sender, unhooks their destroy listeners, and removes both handlers', () => {
  const handlers = new Map<string, Function>(), removed: string[] = [], cleaned: string[] = [], unhooked: number[] = [];
  const makeSender = (id: number) => ({ id, getURL: () => 'file:///sites-home.html', once: () => {}, removeListener: () => { unhooked.push(id); }, isDestroyed: () => false, send: () => {} });
  const first = makeSender(1), second = makeSender(2);
  const dispose = registerSiteThemePreviewIpc({
    ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener); }, removeHandler: (channel) => { removed.push(channel); } },
    allowed: () => true,
    subscriptions: { watch: ({ siteDir }) => () => { cleaned.push(siteDir); } },
  });
  const watch = fromMainFrame(handlers.get(channels.watch)!);
  watch({ sender: first }, { siteDir: '/a', subscriptionId: 'tab-1' });
  watch({ sender: first }, { siteDir: '/b', subscriptionId: 'tab-2' });
  watch({ sender: second }, { siteDir: '/c', subscriptionId: 'tab-1' });
  dispose();
  assert.deepEqual(cleaned, ['/a', '/b', '/c']);
  assert.deepEqual(unhooked, [1, 2]);
  assert.deepEqual(removed, [channels.watch, channels.unwatch]);
});

test('IPC ignores untrusted, destroyed or malformed claims and never pushes to a destroyed sender', () => {
  const handlers = new Map<string, Function>(), deliveries: unknown[] = [], detached: string[] = [];
  let destroyed = false, claimed = 0, push!: (required: { frame: { siteDir: string; revision: string } }) => void;
  const sender = { id: 1, getURL: () => 'file:///sites-home.html', once: () => {}, removeListener: (event: string) => { detached.push(event); }, isDestroyed: () => destroyed, send: (_channel: string, frame: unknown) => deliveries.push(frame) };
  const stranger = { ...sender, id: 2 };
  registerSiteThemePreviewIpc({
    ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener); }, removeHandler: () => {} },
    allowed: ({ sender: source }) => source === sender,
    subscriptions: { watch: ({ listener }) => { claimed++; push = listener; return () => {}; } },
  });
  const watch = fromMainFrame(handlers.get(channels.watch)!), unwatch = fromMainFrame(handlers.get(channels.unwatch)!);
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
  push({ frame: { siteDir: '/b', revision: 'late' } });
  assert.deepEqual(deliveries, []);
  watch({ sender }, { siteDir: '/c', subscriptionId: '3' });
  assert.equal(claimed, 2);
  unwatch({ sender }, { subscriptionId: '2' });
  assert.deepEqual(detached, ['destroyed']);
});

test('B115: a site page in an iframe of the trusted window cannot claim a watch, even though the window URL is trusted', () => {
  const handlers = new Map<string, Function>(), deliveries: unknown[] = [];
  let claimed = 0;
  const sender = { id: 1, getURL: () => 'file:///sites-home.html', once: () => {}, removeListener: () => {}, isDestroyed: () => false, send: (_channel: string, frame: unknown) => deliveries.push(frame) };
  registerSiteThemePreviewIpc({
    ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener); }, removeHandler: () => {} },
    allowed: ({ sender: source }) => source.getURL() === 'file:///sites-home.html',
    subscriptions: { watch: ({ siteDir, listener }) => { claimed++; listener({ frame: { siteDir, revision: 'one' } }); return () => {}; } },
  });
  const watch = handlers.get(channels.watch)!;
  const shellFrame = { url: 'file:///sites-home.html', parent: null };
  watch({ sender, senderFrame: { url: 'http://127.0.0.1:4000/', parent: shellFrame } }, { siteDir: '/a', subscriptionId: '1' });
  watch({ sender, senderFrame: { url: 'file:///sites-home.html', parent: shellFrame } }, { siteDir: '/a', subscriptionId: '2' });
  watch({ sender, senderFrame: null }, { siteDir: '/a', subscriptionId: '3' });
  assert.equal(claimed, 0);
  assert.deepEqual(deliveries, []);
  watch({ sender, senderFrame: shellFrame }, { siteDir: '/a', subscriptionId: '4' });
  assert.equal(claimed, 1);
});
