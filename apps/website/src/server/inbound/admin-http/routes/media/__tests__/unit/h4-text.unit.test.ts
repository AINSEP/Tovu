import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { DocumentTextExtractionError, MediaNotFoundError, MediaValidationError } from '@jini-ai/cms/media';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import type { MediaRouteDeps } from '../../deps.js';
import { registerAdminMediaTextRoute } from '../../text.js';

const PATH = '/api/admin/v1/workspaces/:workspaceId/media/:mediaId/text';
for (const [failure, status, body] of [
  [new MediaNotFoundError({ message: 'document missing' }), 404, { error: 'document missing' }],
  [new MediaValidationError({ message: 'document read refused' }), 400, { error: 'document read refused' }],
  [new DocumentTextExtractionError({ code: 'DOCUMENT_TEXT_FAILED', message: 'Text extraction failed' }), 400, { error: 'Text extraction failed', code: 'DOCUMENT_TEXT_FAILED' }],
  [new Error('private blob-store path'), 500, { error: 'internal error' }],
] as const) {
  test(`text route maps ${failure.constructor.name} and preserves private response headers`, async () => {
    const app = express();
    registerAdminMediaTextRoute({ app, deps: portFake<MediaRouteDeps>({ workspaceId: 'ws',
      authorize: async () => ({ allowed: true, reason: 'owner' }), mediaRepo: { findById: async () => { throw failure; } },
    }) });
    const { res, capture } = createCapturingResponse(); res.locals.principal = { id: 'owner' };
    const headers: Record<string, string> = {};
    res.set = ((key: string, value: string) => { headers[key] = value; return res; }) as typeof res.set;
    await extractRouteHandler(app, 'get', PATH)({ params: { workspaceId: 'ws', mediaId: 'document' }, query: {} }, res);
    assert.deepEqual(capture, { statusCode: status, jsonBody: body });
    assert.deepEqual(headers, { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  });
}

for (const offset of ['', '-1', '1.5', '1e3', ['0', '1'], { value: '0' }]) {
  test(`text route refuses a nondecimal offset ${JSON.stringify(offset)} before reading bytes`, async () => {
    const app = express();
    registerAdminMediaTextRoute({ app, deps: portFake<MediaRouteDeps>({ workspaceId: 'ws',
      authorize: async () => ({ allowed: true, reason: 'owner' }), mediaRepo: { findById: async () => assert.fail('invalid offset must not read') },
    }) });
    const { res, capture } = createCapturingResponse(); res.locals.principal = { id: 'owner' };
    res.set = (() => res) as typeof res.set;
    await extractRouteHandler(app, 'get', PATH)({ params: { workspaceId: 'ws', mediaId: 'document' }, query: { offset } }, res);
    assert.deepEqual(capture, { statusCode: 400, jsonBody: { error: 'offset must be a non-negative byte offset' } });
  });
}
