/** Queue regressions through the existing Jini batch gate and delegated HTTP transport. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBatchInputs, type BatchResult } from '../../../assistant/batch-tool-inputs.js';
import { delegatedText, executeDelegatedRegisteredTool, invokeRegisteredTool } from '../../../assistant/__tests__/fixtures/execute-registered-tool.js';
import { buildWebScreenshotRegistrations } from '../tool-registrations.js';
import { createWebScreenshotService, readWebScreenshotInput, type PageCaptureRequest, type WebScreenshotPorts } from '../web-screenshot.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

/** No browser, sockets, image codec, or real clock: only the first fake capture may be held. */
function fixture({ holdFirst = false }: { holdFirst?: boolean } = {}) {
  const entered = deferred();
  const release = deferred();
  const timers = new Set<() => void>();
  const requests: PageCaptureRequest[] = [];
  let running = 0;
  const ports: WebScreenshotPorts = {
    nowMs: () => 0,
    scheduleQueueTimeout: ({ onTimeout }) => { timers.add(onTimeout); return () => { timers.delete(onTimeout); }; },
    encodeTiles: async () => [{ top: 0, width: 1, height: 1, bytes: Buffer.from('fake-jpeg') }],
    capture: { close: async () => {}, capture: async request => {
      requests.push(request);
      running++;
      assert.equal(running, 1, 'single browser concurrency must hold across batch items');
      try {
        if (requests.length === 1) {
          entered.resolve();
          if (holdFirst) await release.promise;
        }
        return { png: Buffer.from('fake-png'), finalUrl: request.url, status: 200, title: 'fake', pageHeight: 1, capturedHeight: 1, blockedRequests: 0 };
      } finally { running--; }
    } },
  };
  const service = createWebScreenshotService({ ports });
  const registrations = buildWebScreenshotRegistrations({ routeDeps: { workspaceId: 'ws', authorize: async () => ({ allowed: true, reason: 'matched' }) }, service });
  return { registration: applyBatchInputs({ registrations })[0]!, service, entered, release, timers, requests };
}

test('screenshot batches run sequentially through the existing queue', async () => {
  const h = fixture({ holdFirst: true });
  const input = { items: Array.from({ length: 8 }, (_, i) => ({ url: `https://example.com/${i}` })) };
  const pending = invokeRegisteredTool(h.registration, { executionId: 'batch', principal: { id: 'owner' }, run: { id: 'run' }, input, signal: new AbortController().signal });
  try {
    await h.entered.promise;
    assert.equal(h.requests.length, 1);
  } finally { h.release.resolve(); }
  const output = await pending as BatchResult;
  assert.equal(output.succeeded, 8);
  assert.equal(output.failed, 0);
  assert.deepEqual(h.requests.map(request => request.url), input.items.map(item => item.url));
  assert.equal(h.timers.size, 0);
});

test('delegated HTTP screenshot batches return successful results instead of HTTP 400 busy', async () => {
  const h = fixture();
  const result = await executeDelegatedRegisteredTool({ registration: h.registration, input: { items: [1, 2, 3, 4].map(n => ({ url: `https://example.com/${n}` })) } });
  assert.notEqual(result.isError, true, delegatedText(result));
  assert.equal(h.requests.length, 4);
  assert.equal(h.timers.size, 0);
});

test('cancelling a queued screenshot does not release a running capture or block its successor', async () => {
  const h = fixture({ holdFirst: true });
  const call = (n: number, signal?: AbortSignal) => h.service.screenshot({ input: readWebScreenshotInput({ url: `https://example.com/${n}` }) }, { signal });
  const first = call(1);
  await h.entered.promise;
  const controller = new AbortController();
  const cancelled = assert.rejects(call(2, controller.signal), { name: 'AbortError' });
  const third = call(3);
  controller.abort();
  try {
    await cancelled;
    assert.equal(h.requests.length, 1);
  } finally { h.release.resolve(); }
  await Promise.all([first, third]);
  assert.deepEqual(h.requests.map(request => request.url), ['https://example.com/1', 'https://example.com/3']);
  assert.equal(h.timers.size, 0);
});

test('expired queued callers cannot capture later or let a successor overlap the active capture', async () => {
  const h = fixture({ holdFirst: true });
  const call = (n: number) => h.service.screenshot({ input: readWebScreenshotInput({ url: `https://example.com/${n}` }) });
  const first = call(1);
  await h.entered.promise;
  const expired = assert.rejects(call(2), /waited 60000 ms/);
  const expireSecond = [...h.timers][0]!;
  const third = call(3);
  expireSecond();
  try {
    await expired;
    assert.equal(h.requests.length, 1);
  } finally { h.release.resolve(); }
  await Promise.all([first, third]);
  assert.deepEqual(h.requests.map(request => request.url), ['https://example.com/1', 'https://example.com/3']);
  assert.equal(h.timers.size, 0);
});

test('queue deadline configuration cannot exceed sixty seconds', () => {
  for (const maxQueueWaitMs of [-1, 60_001, 0.5, Infinity, NaN]) {
    assert.throws(() => createWebScreenshotService({ ports: {} as WebScreenshotPorts }, { maxQueueWaitMs }), /integer from 0 to 60000/);
  }
});
