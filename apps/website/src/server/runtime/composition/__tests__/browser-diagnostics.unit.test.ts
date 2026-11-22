import assert from 'node:assert/strict';
import test from 'node:test';
import { siteBrowserDiagnosticsModule } from '../browser-diagnostics.js';

test('site diagnostics waits for full consent, reports one buffered navigation and error codes, and disposes', () => {
  const bridge = new Function(siteBrowserDiagnosticsModule.replace('export default', 'return'))();
  const sent: { body: string; signal: AbortSignal }[] = [];
  let notify!: (state: { analyticsLevel: string }) => void;
  let observe!: (list: { getEntries(): { duration: number }[] }) => void;
  let observers = 0, disconnected = 0, unsubscribed = 0;
  const target = Object.assign(new EventTarget(), { AbortController,
    PerformanceObserver: class {
      constructor(callback: typeof observe) { observe = callback; observers++; }
      observe(options: unknown) { assert.deepEqual(options, { type: 'navigation', buffered: true }); }
      disconnect() { disconnected++; }
    },
    fetch: (url: string, input: { body: string; signal: AbortSignal }) => { assert.equal(url, '/_jini/browser-analytics/site/diagnostics'); sent.push(input); return Promise.reject(new Error('offline')); },
  });
  const api = { get: () => ({ analyticsLevel: 'none' }), subscribe: ({ listener }: { listener: typeof notify }) => { notify = listener; return () => { unsubscribed++; }; } };
  const unmount = bridge.mount({ api, doc: { defaultView: target } });
  target.dispatchEvent(new Event('error'));
  assert.equal(observers, 0); assert.equal(sent.length, 0, 'nothing is sent before full consent');
  notify({ analyticsLevel: 'full' }); notify({ analyticsLevel: 'full' });
  assert.equal(observers, 1);
  observe({ getEntries: () => [{ duration: 0 }, { duration: 12 }, { duration: 34 }] });
  observe({ getEntries: () => [{ duration: 56 }] });
  target.dispatchEvent(new Event('error')); target.dispatchEvent(new Event('unhandledrejection'));
  assert.deepEqual(sent.map(input => JSON.parse(input.body)), [{ navigationMs: 12 }, { errorKind: 1 }, { errorKind: 2 }]);
  notify({ analyticsLevel: 'anonymous' });
  assert.equal(disconnected, 2); assert.ok(sent.every(input => input.signal.aborted));
  target.dispatchEvent(new Event('error')); target.dispatchEvent(new Event('unhandledrejection'));
  assert.equal(sent.length, 3);
  unmount(); assert.equal(unsubscribed, 1);
  const unmountFull = bridge.mount({ api: { ...api, get: () => ({ analyticsLevel: 'full' }) }, doc: { defaultView: target } });
  assert.equal(observers, 2);
  unmountFull(); target.dispatchEvent(new Event('error'));
  assert.equal(disconnected, 3); assert.equal(unsubscribed, 2); assert.equal(sent.length, 3);
});
