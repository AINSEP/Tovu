import assert from 'node:assert/strict';
import test from 'node:test';
import { reportShellTelemetry, installShellErrorReporting } from './product-telemetry.js';

test('shell actions send only the explicit payload and a broken bridge cannot break the action', () => {
  const sent: unknown[] = [];
  reportShellTelemetry({ payload: { kind: 'action', id: 'open_admin' } }, { bridge: { report: payload => { sent.push(payload); } } });
  assert.deepEqual(sent, [{ kind: 'action', id: 'open_admin' }]);
  assert.doesNotThrow(() => reportShellTelemetry({ payload: { kind: 'screen', id: 'projects' } }, { bridge: { report() { throw new Error('FAKE_IPC_ERROR'); } } }));
});

test('error and unhandledrejection listeners cap text before IPC; cleanup removes both without preventing default handling', () => {
  const target = new EventTarget(), sent: unknown[] = [];
  const dispose = installShellErrorReporting({ target: target as unknown as Window }, { report: input => { sent.push(input.payload); } });
  const failure = new Error('m'.repeat(1001)); failure.stack = 's'.repeat(8001);
  const event = Object.assign(new Event('error', { cancelable: true }), { error: failure, message: 'fallback' });
  target.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'fake rejection' }));
  assert.deepEqual(sent[0], { kind: 'error', message: 'm'.repeat(1000), stack: 's'.repeat(8000) });
  assert.equal((sent[1] as { kind: string; message: string }).kind, 'error');
  assert.equal((sent[1] as { message: string }).message, 'fake rejection');
  dispose(); target.dispatchEvent(event);
  target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'after dispose' }));
  assert.equal(sent.length, 2);
});
