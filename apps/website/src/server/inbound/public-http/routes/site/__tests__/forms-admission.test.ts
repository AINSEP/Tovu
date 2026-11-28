import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type ErrorRequestHandler, type Request } from 'express';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
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

// A raw client that sends no Accept header at all gets the JSON wire response too, never the HTML renderer.
for (const accept of ['application/json', undefined]) test(`admission refusals for Accept ${accept ?? '(absent)'} retain their original wire response when native rendering is supplied`, async () => {
  let nativeCalls = 0;
  const bodies: unknown[] = [], statuses: number[] = [];
  const middleware = createFormsAdmissionMiddleware({ workspaceId: 'w', clock: { nowMs: () => 0 } }, {
    onHtmlRefusal: async () => { nativeCalls++; },
  });
  const request = { headers: accept === undefined ? {} : { accept }, socket: { remoteAddress: '203.0.113.9' } } as never;
  const response = { set: () => response, status: (status: number) => { statuses.push(status); return response; },
    json: (body: unknown) => { bodies.push(body); return response; } } as never;
  for (let i = 0; i < 6; i++) await middleware(request, response, () => {});
  assert.equal(nativeCalls, 0);
  assert.deepEqual(statuses, [429]);
  assert.deepEqual(bodies, [{ code: 'FORMS_RATE_LIMIT_EXCEEDED', error: 'Too many form requests. Wait 60 seconds, then send the form again.' }]);
});

test('a failed native refusal renderer reaches Express error handling without admitting the blocked submission', async t => {
  const app = express();
  const error = new Error('native refusal renderer is unavailable');
  const attempts: { request: Request; retryAfterSeconds: number }[] = [];
  const forwarded: unknown[] = [];
  let admitted = 0;
  app.post('/forms/contact/submit',
    createFormsAdmissionMiddleware({ workspaceId: 'fixture', clock: { nowMs: () => 0 } }, {
      async onHtmlRefusal({ request, retryAfterSeconds }) {
        attempts.push({ request, retryAfterSeconds });
        throw error;
      },
    }),
    (_req, res) => { admitted++; res.status(202).end(); },
  );
  const handleError: ErrorRequestHandler = (failure, _req, res, _next) => {
    forwarded.push(failure);
    res.status(503).send('Please retry later');
  };
  app.use(handleError);
  const url = `${await startTestServer(app, t)}/forms/contact/submit`;
  const submit = () => fetch(url, { method: 'POST', headers: { accept: 'text/html' } });
  for (let index = 0; index < 5; index++) assert.equal((await submit()).status, 202);

  const blocked = await submit();
  assert.equal(blocked.status, 503);
  assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal(await blocked.text(), 'Please retry later');
  assert.equal(admitted, 5);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.request.originalUrl, '/forms/contact/submit');
  assert.equal(attempts[0]?.retryAfterSeconds, 60);
  assert.deepEqual(forwarded, [error]);
});
