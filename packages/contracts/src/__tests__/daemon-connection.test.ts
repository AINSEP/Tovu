import assert from 'node:assert/strict';
import test from 'node:test';
import { daemonConnection, daemonControlRequest, daemonEndpoint, daemonSiteRegistration, siteIdleStopReply } from '../daemon-connection.js';

/**
 * @file Pins the grammar of the desktop's inherited-IPC daemon control channel. Both ends parse with
 * these schemas, so an unknown key or operation must be refused rather than ignored: a looser schema
 * would let one side send a field the other silently drops.
 */

const registration = { operation: 'register', siteId: 's1', env: {}, token: 't' };

test('a control request with an unknown operation is refused', () => {
  assert.equal(daemonControlRequest.safeParse({ operation: 'reboot' }).success, false);
});

test('a control request with an extra key is refused for every strict operation', () => {
  for (const request of [{ operation: 'ready' }, { operation: 'stopIfIdle' }, { operation: 'withdraw', siteId: 's1' },
    { operation: 'parking', pid: 1 }, { operation: 'unavailable', pid: 1 }, registration]) {
    assert.equal(daemonControlRequest.safeParse(request).success, true, `${request.operation} parses as sent`);
    assert.equal(daemonControlRequest.safeParse({ ...request, extra: true }).success, false, `${request.operation} refuses an extra key`);
  }
});

test('only a strict boolean idle reply can acknowledge a guarded shutdown', () => {
  assert.equal(siteIdleStopReply.safeParse({ idle: true }).success, true);
  assert.equal(siteIdleStopReply.safeParse({ idle: 'yes' }).success, false);
  assert.equal(siteIdleStopReply.safeParse({ idle: true, extra: 1 }).success, false);
});

test('a site registration refuses an unknown key, and a connection needs its token', () => {
  assert.equal(daemonSiteRegistration.safeParse({ siteId: 's1', env: {}, token: 't', extra: 1 }).success, false);
  assert.equal(daemonEndpoint.safeParse({ url: 'http://127.0.0.1:1/s/a', pid: 1 }).success, true);
  assert.equal(daemonConnection.safeParse({ url: 'http://127.0.0.1:1/s/a', pid: 1 }).success, false);
});
