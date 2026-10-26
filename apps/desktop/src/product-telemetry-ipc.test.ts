import assert from 'node:assert/strict';
import test from 'node:test';
import { createNoopTracker } from '@jini-ai/diagnostics/observability';
import { registerProductTelemetryIpc } from './product-telemetry-ipc.ts';
import { PRODUCT_TELEMETRY_CHANNEL } from './contracts/product-telemetry.ts';

function fixture() {
  const errors: unknown[] = [], events: unknown[] = [];
  let listener: Parameters<Parameters<typeof registerProductTelemetryIpc>[0]['ipcMain']['on']>[1];
  let removed = 0, at = 0;
  const dispose = registerProductTelemetryIpc({ ipcMain: {
    on: (channel, handler) => { assert.equal(channel, PRODUCT_TELEMETRY_CHANNEL); listener = handler; },
    removeListener: (channel, handler) => { assert.equal(channel, PRODUCT_TELEMETRY_CHANNEL); assert.equal(handler, listener); removed++; },
  }, isShellPage: url => url === 'file:///fake-shell.html', tracker: {
    ...createNoopTracker({}), error: (error, context) => { errors.push({ error, context }); }, capture: event => { events.push(event); },
  } }, { now: () => at });
  const trusted = { sender: { getURL: () => 'file:///fake-shell.html' }, senderFrame: { url: 'file:///fake-shell.html', parent: null } };
  return { send: (input: unknown, event: Parameters<typeof listener>[0] = trusted) => listener(event, input), trusted, errors, events, dispose,
    removed: () => removed, at: (next: number) => { at = next; } };
}

test('IPC drops wrong sender, subframe, unknown kind/id, extra keys, wrong types and oversized strings', () => {
  const f = fixture();
  const error = { kind: 'error', message: 'fake failure', stack: 'fake stack' };
  for (const input of [null, [], {}, { kind: 'unknown' }, { kind: 'action', id: 'site-name' }, { kind: 'screen', id: 'private-site' },
    { kind: 'action', id: 'open_admin', siteId: 'private' }, { ...error, siteDir: '/private' },
    { ...error, message: 'x'.repeat(1001) }, { ...error, stack: 'x'.repeat(8001) }, { kind: 'action', id: 'x'.repeat(81) },
    { ...error, message: 1 }, { ...error, stack: undefined }, { kind: 'action', id: 1 }]) f.send(input);
  f.send(error, { ...f.trusted, sender: { getURL: () => 'https://evil.example.test' } });
  f.send(error, { ...f.trusted, senderFrame: { url: 'https://evil.example.test', parent: null } });
  f.send(error, { ...f.trusted, senderFrame: { url: 'file:///fake-shell.html', parent: {} } });
  f.send(error, { ...f.trusted, senderFrame: null });
  assert.deepEqual(f.errors, []); assert.deepEqual(f.events, []);
});

test('IPC permits bounded catalog payloads and only ten errors in a rolling minute; actions do not consume budget', () => {
  const f = fixture();
  const error = { kind: 'error', message: 'x'.repeat(1000), stack: 's'.repeat(8000) };
  for (let i = 0; i < 11; i++) f.send(error);
  assert.equal(f.errors.length, 10);
  f.send({ kind: 'action', id: 'open_admin' }); f.send({ kind: 'screen', id: 'projects' });
  assert.deepEqual(f.events, [
    { name: 'desktop_action', properties: { action: 'open_admin' } }, { name: 'desktop_screen_viewed', properties: { screen: 'projects' } },
  ]);
  f.at(59_999); f.send(error); assert.equal(f.errors.length, 10);
  f.at(60_000); f.send(error); assert.equal(f.errors.length, 11);
  const report = f.errors[0] as { error: Error; context: unknown };
  assert.equal(report.error.message, error.message); assert.equal(report.error.stack, error.stack);
  assert.deepEqual(report.context, { operation: 'desktop.shell_error', attributes: { process: 'renderer' } });
  f.dispose(); assert.equal(f.removed(), 1);
});
