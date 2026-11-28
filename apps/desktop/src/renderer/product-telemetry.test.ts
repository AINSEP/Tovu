import assert from 'node:assert/strict';
import test from 'node:test';
import { reportShellTelemetry, installShellErrorReporting } from './product-telemetry.js';
import { installDom } from './dom-hook-harness.js';

test('with no window and no injected bridge, reporting is a silent no-op (runs before any DOM is installed)', () => {
  assert.equal(typeof globalThis.window, 'undefined', 'precondition: this test must run before installDom');
  assert.doesNotThrow(() => reportShellTelemetry({ payload: { kind: 'action', id: 'open_admin' } }));
});

test('shell actions send only the explicit payload and a broken bridge cannot break the action', () => {
  const sent: unknown[] = [];
  reportShellTelemetry({ payload: { kind: 'action', id: 'open_admin' } }, { bridge: { report: ({ payload }, _options = {}) => { sent.push(payload); } } });
  assert.deepEqual(sent, [{ kind: 'action', id: 'open_admin' }]);
  assert.doesNotThrow(() => reportShellTelemetry({ payload: { kind: 'screen', id: 'projects' } }, { bridge: { report() { throw new Error('FAKE_IPC_ERROR'); } } }));
});

test('window errors and rejections reach the bridge as shell error payloads; teardown stops both', () => {
  // Caps, fallbacks and default handling are covered beside `installGlobalErrorReporting` in @jini-ai/diagnostics.
  const target = new EventTarget(), sent: unknown[] = [];
  const dispose = installShellErrorReporting({ target }, { report: input => { sent.push(input.payload); } });
  const failure = new Error('fake failure'); failure.stack = 'fake stack';
  const event = Object.assign(new Event('error', { cancelable: true }), { error: failure, message: 'fallback' });
  target.dispatchEvent(event);
  target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'fake rejection' }));
  assert.deepEqual(sent[0], { kind: 'error', message: 'fake failure', stack: 'fake stack' });
  assert.equal((sent[1] as { kind: string; message: string }).kind, 'error');
  assert.equal((sent[1] as { message: string }).message, 'fake rejection');
  dispose(); target.dispatchEvent(event);
  target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'after dispose' }));
  assert.equal(sent.length, 2);
});

test('the default error reporter sends the shell payload through the actual preload lookup and detaches', (t) => {
  const window = installDom();
  const previous = window.tovuTelemetry;
  const received: unknown[] = [];
  window.tovuTelemetry = { report: (input) => received.push(input) };
  t.after(() => { window.tovuTelemetry = previous; });
  const dispose = installShellErrorReporting({ target: window });
  try {
    const failure = new Error('renderer load failed');
    failure.stack = 'pinned stack';
    const error = new window.ErrorEvent('error', { error: failure, message: 'fallback', cancelable: true });
    assert.equal(window.dispatchEvent(error), true, 'host preserves normal browser event handling');
    assert.deepEqual(received, [{ payload: { kind: 'error', message: 'renderer load failed', stack: 'pinned stack' } }]);
  } finally {
    dispose();
  }
  window.dispatchEvent(new window.ErrorEvent('error', { message: 'after teardown' }));
  assert.equal(received.length, 1);
});
