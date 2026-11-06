import assert from 'node:assert/strict';
import test from 'node:test';
import { createFormsAdmissionMiddleware } from '../forms-admission.js';

test('source and site admission runs before a body reader and uses injected time without sleeping', async () => {
  let now = 0, nextCalls = 0; const responses: number[] = [];
  const middleware = createFormsAdmissionMiddleware({ workspaceId: 'w', clock: { nowMs: () => now } });
  const request = { ip: '203.0.113.9', headers: {}, socket: { remoteAddress: '203.0.113.9' } } as never;
  const response = { set: () => response, status: (status: number) => { responses.push(status); return response; }, json: () => response } as never;
  for (let i = 0; i < 6; i++) await middleware(request, response, () => { nextCalls++; });
  assert.equal(nextCalls, 5); assert.deepEqual(responses, [429]);
  now = 60001; await middleware(request, response, () => { nextCalls++; });
  assert.equal(nextCalls, 6);
});

test('rotating IPs cannot bypass the aggregate site budget', async () => {
  const middleware = createFormsAdmissionMiddleware({ workspaceId: 'w', clock: { nowMs: () => 0 } });
  let nextCalls = 0; const statuses: number[] = [];
  const response = { set: () => response, status: (status: number) => { statuses.push(status); return response; }, json: () => response } as never;
  for (let i = 0; i < 31; i++) await middleware({ ip: `ip-${i}`, headers: { 'content-type': 'multipart/form-data; boundary=x' }, socket: { remoteAddress: `ip-${i}` } } as never, response, () => { nextCalls++; });
  assert.equal(nextCalls, 30); assert.deepEqual(statuses, [429]);
});

test('URL-encoded signup spikes do not consume the multipart site budget', async () => {
  const middleware = createFormsAdmissionMiddleware({ workspaceId: 'w', clock: { nowMs: () => 0 } });
  let admitted = 0; const statuses: number[] = [];
  const response = { set: () => response, status: (status: number) => { statuses.push(status); return response; }, json: () => response } as never;
  for (let i = 0; i < 40; i++) await middleware({ headers: { 'content-type': 'application/x-www-form-urlencoded' }, socket: { remoteAddress: `ip-${i}` } } as never, response, () => { admitted++; });
  assert.equal(admitted, 40); assert.deepEqual(statuses, []);
});


test('a native admission refusal keeps the retry header and delegates without reading the body', async () => {
  let nextCalls = 0, bodyReads = 0, jsonCalls = 0;
  const refusals: number[] = [], retryHeaders: string[] = [];
  const middleware = createFormsAdmissionMiddleware({ workspaceId: 'w', clock: { nowMs: () => 0 } }, {
    onHtmlRefusal: async ({ retryAfterSeconds }) => { refusals.push(retryAfterSeconds); },
  });
  const request = { ip: '203.0.113.9', headers: { accept: 'text/html' }, socket: { remoteAddress: '203.0.113.9' },
    get body() { bodyReads++; throw new Error('body must remain unread'); } } as never;
  const response = { set: (_name: string, value: string) => { retryHeaders.push(value); return response; },
    status: () => response, json: () => { jsonCalls++; return response; } } as never;
  for (let i = 0; i < 6; i++) await middleware(request, response, () => { nextCalls++; });
  assert.equal(nextCalls, 5);
  assert.deepEqual(refusals, [60]);
  assert.deepEqual(retryHeaders, ['60']);
  assert.equal(bodyReads, 0);
  assert.equal(jsonCalls, 0);
});

test('JSON admission refusals retain their original wire response when native rendering is supplied', async () => {
  let nativeCalls = 0;
  const bodies: unknown[] = [], statuses: number[] = [];
  const middleware = createFormsAdmissionMiddleware({ workspaceId: 'w', clock: { nowMs: () => 0 } }, {
    onHtmlRefusal: async () => { nativeCalls++; },
  });
  const request = { headers: { accept: 'application/json' }, socket: { remoteAddress: '203.0.113.9' } } as never;
  const response = { set: () => response, status: (status: number) => { statuses.push(status); return response; },
    json: (body: unknown) => { bodies.push(body); return response; } } as never;
  for (let i = 0; i < 6; i++) await middleware(request, response, () => {});
  assert.equal(nativeCalls, 0);
  assert.deepEqual(statuses, [429]);
  assert.deepEqual(bodies, [{ code: 'FORMS_RATE_LIMIT_EXCEEDED', error: 'Too many form requests. Wait 60 seconds, then send the form again.' }]);
});
