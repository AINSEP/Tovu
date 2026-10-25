/** S2 reviewed pull-only contract: trusted frame, validated request, fixed channel and no Stop. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { RUNNER_RESOURCES_GET_CHANNEL, type ResourcesRequest } from './contracts/resources.ts';
import { registerResourcesIpc } from './resources-ipc.ts';
import { createDesktopResources } from './desktop-resources.ts';

function fixture() {
  const calls: ResourcesRequest[] = [];
  const handlers = new Map<string, (event: { senderFrame: { url: string; parent: unknown } | null }, input: unknown) => unknown>();
  const monitor = createDesktopResources({ desktopPid: 1, platform: 'darwin', now: () => 100_000,
    totalMem: () => 1000, openSites: () => [],
    listUsage: async () => [{ pid: 1, ppid: 0, rssBytes: 100, cpuSeconds: 0, name: 'Electron' }] });
  registerResourcesIpc({ ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener); } },
    allowed: (url) => url === 'file:///sites-home.html', monitor: { get: (input) => { calls.push(input); return monitor.get(input); } } });
  return { handlers, calls, get: handlers.get(RUNNER_RESOURCES_GET_CHANNEL)!, event: { senderFrame: { url: 'file:///sites-home.html', parent: null } } };
}

test('S2 registers only runner:resources:get and resolves the monitor DTO', async () => {
  const f = fixture();
  assert.equal(RUNNER_RESOURCES_GET_CHANNEL, 'runner:resources:get');
  assert.deepEqual([...f.handlers.keys()], ['runner:resources:get']);
  const snapshot = await f.get(f.event, { panelOpen: true, ignored: 'private input' });
  assert.deepEqual(f.calls, [{ panelOpen: true }]);
  assert.equal((snapshot as { total: { rssBytes: number } }).total.rssBytes, 100);
  assert.ok(!JSON.stringify(snapshot).includes('private input'));
});

test('S2 rejects malformed payloads without sampling or echoing renderer input', () => {
  const f = fixture();
  for (const input of [undefined, null, false, [], {}, { panelOpen: 'private input' }, { panelOpen: 1 }]) {
    assert.throws(() => f.get(f.event, input), { message: 'Invalid resource monitor request.' });
  }
  assert.deepEqual(f.calls, []);
});

test('S2 untrusted, navigated or destroyed frames cannot read fleet processes', () => {
  const f = fixture();
  for (const senderFrame of [null, { url: 'https://example.com', parent: null }, { url: 'file:///other.html', parent: null },
    { url: 'file:///sites-home.html?fake=1', parent: null }, { url: 'file:///sites-home.html', parent: {} }]) {
    assert.throws(() => f.get({ senderFrame }, { panelOpen: true }), { message: 'Resource monitor is only available in the sites home window.' });
  }
  assert.deepEqual(f.calls, []);
});
