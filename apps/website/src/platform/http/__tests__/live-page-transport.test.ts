/** t08: real guarded wire adapter with fake DNS/socket; limits must stop reads, not just slice output. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, ClientRequest } from 'node:http';
import type { RequestOptions } from 'node:https';
import test from 'node:test';
import { LIVE_PAGE_EGRESS_POLICY } from '../egress-policies.js';

test('real transport pins the validated IP, preserves cookies, caps reads and forwards the absolute deadline', async t => {
  let latestResponse: PassThrough | undefined;
  const requests: RequestOptions[] = [];
  let body = 'abcdef';
  t.mock.module('node:https', { namedExports: { request: (options: RequestOptions, callback: (res: IncomingMessage) => void) => {
    requests.push(options);
    const req = new EventEmitter() as ClientRequest;
    req.destroy = error => { if (error) req.emit('error', error); return req; };
    req.end = (() => {
      queueMicrotask(() => {
        const res = new PassThrough() as PassThrough & IncomingMessage;
        latestResponse = res; res.statusCode = 200;
        res.headers = { 'set-cookie': ['sid=SECRET; HttpOnly', 'prefs=OTHER; Expires=Wed, 01 Oct 2030 00:00:00 GMT; Secure'] };
        callback(res); res.end(body);
      }); return req;
    }) as ClientRequest['end'];
    return req;
  } } });
  let dnsCalls = 0;
  t.mock.module('node:dns/promises', { namedExports: { lookup: async () => { dnsCalls++; return [{ address: dnsCalls === 1 ? '8.8.8.8' : '9.9.9.9', family: 4 }]; } } });
  const { createDefaultHttpClient } = await import('../client.js');
  const client = createDefaultHttpClient(LIVE_PAGE_EGRESS_POLICY);
  const signal = new AbortController().signal;
  const result = await client.send({ method: 'GET', url: 'https://site.example/', headers: {}, timeoutMs: 15000, maxResponseBytes: 5, signal });
  assert.equal(result.bodyText, 'abcde'); assert.equal(result.bodyBytes?.byteLength, 5); assert.equal(result.bodyTruncated, true);
  assert.equal(latestResponse?.destroyed, true, 'the response must actually stop at the cap');
  assert.deepEqual(result.setCookies, ['sid=SECRET; HttpOnly', 'prefs=OTHER; Expires=Wed, 01 Oct 2030 00:00:00 GMT; Secure']);
  assert.equal(requests[0]?.host, '8.8.8.8'); assert.equal(requests[0]?.servername, 'site.example'); assert.equal(requests[0]?.signal, signal);
  assert.deepEqual(requests[0]?.headers, { 'User-Agent': 'Tovu/0.1.0', host: 'site.example' }); assert.equal(dnsCalls, 1, 'no second DNS resolution at connect time');
  body = 'abcde';
  const exact = await client.send({ method: 'GET', url: 'https://site.example/', headers: {}, timeoutMs: 15000, maxResponseBytes: 5, signal });
  assert.equal(exact.bodyText, 'abcde'); assert.equal(exact.bodyTruncated, false);
});

test('a DNS deadline expires without dialing or dialing later when DNS eventually completes', async t => {
  let resolveDns: ((value: unknown) => void) | undefined; let connects = 0;
  t.mock.module('node:dns/promises', { namedExports: { lookup: async () => new Promise(resolve => { resolveDns = resolve; }) } });
  const { createHttpClient } = await import('../client.js?dns-timeout');
  const client = createHttpClient({ policy: LIVE_PAGE_EGRESS_POLICY, transport: { requestPinned: async () => { connects++; return { status: 200, headers: {}, bodyText: '' }; } } });
  const controller = new AbortController();
  const work = client.send({ method: 'GET', url: 'https://site.example/', headers: {}, timeoutMs: 15000, signal: controller.signal });
  controller.abort(new Error('test deadline'));
  await assert.rejects(work, { message: 'test deadline' });
  resolveDns!([{ address: '8.8.8.8', family: 4 }]);
  await Promise.resolve(); await Promise.resolve(); assert.equal(connects, 0);
});
