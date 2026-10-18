import assert from 'node:assert/strict';
import test from 'node:test';
import type { Response } from 'express';
import { decodeApiError } from '@jini-ai/protocol';
import { respondToApiError } from '../respond.js';

for (const [code, status] of [['NOT_FOUND', 404], ['FORBIDDEN', 403], ['INTERNAL_ERROR', 500]] as const) {
  test(`canonical ${code} response decodes with the existing request id`, () => {
    let actualStatus = 0, body: unknown;
    const res = { locals: { requestId: 'existing-request' }, status(value: number) { actualStatus = value; return this; }, json(value: unknown) { body = value; return this; } } as unknown as Response;
    respondToApiError({ res, code, message: 'caller-safe message' }, { details: { permission: 'analytics.read' } });
    assert.equal(actualStatus, status);
    assert.deepEqual(decodeApiError({ body }), { code, message: 'caller-safe message', requestId: 'existing-request', details: { permission: 'analytics.read' } });
    assert.deepEqual(body, { error: { code, message: 'caller-safe message', requestId: 'existing-request', details: { permission: 'analytics.read' } } });
  });
}

test('a standalone route omits correlation metadata instead of minting a competing id', () => {
  let body: unknown;
  const res = { locals: {}, status() { return this; }, json(value: unknown) { body = value; return this; } } as unknown as Response;
  respondToApiError({ res, code: 'INTERNAL_ERROR', message: 'internal error' });
  assert.deepEqual(body, { error: { code: 'INTERNAL_ERROR', message: 'internal error' } });
});
