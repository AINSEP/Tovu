import assert from 'node:assert/strict';
import test from 'node:test';
import { reportShellTelemetry, installShellErrorReporting } from './product-telemetry.js';

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
