import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { DocumentTextExtractionError, MediaNotFoundError, MediaValidationError } from '@jini-ai/cms/media';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import type { MediaRouteDeps } from '../../deps.js';
import { registerAdminMediaTextRoute } from '#src/server/runtime/composition/modules/media';

// w3 C4c: these were direct handler calls with a `res.set`-only double; the route is now a mounted Jini
// spec whose static headers are written through the real Express response, so each rule is pinned over
// the wire instead (same registrar, deps and expected status/body/headers). The 500's copy is the route's
// own GET-media copy, as `media-route-failures.unit.test.ts` pins it; the double had no method or path.
const URL_PATH = '/api/admin/v1/workspaces/ws/media/document/text';

/** An app with the session principal the admin middleware would have set, and the text route mounted. */
function textApp(findById: () => Promise<never>): express.Express {
  const routeErrors = createRouteIncidentReporter().errors;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: 'owner' }; next(); });
  registerAdminMediaTextRoute({ errors: routeErrors, app, deps: portFake<MediaRouteDeps>({ workspaceId: 'ws',
    authorize: async () => ({ allowed: true, reason: 'owner' }), mediaRepo: { findById },
  }) });
  return app;
}

for (const [failure, status, body] of [
  [new MediaNotFoundError({ message: 'document missing' }), 404, { error: 'document missing' }],
  [new MediaValidationError({ message: 'document read refused' }), 400, { error: 'document read refused' }],
  [new DocumentTextExtractionError({ code: 'DOCUMENT_TEXT_FAILED', message: 'Text extraction failed' }), 400, { error: 'Text extraction failed', code: 'DOCUMENT_TEXT_FAILED' }],
  [new Error('private blob-store path'), 500, { error: 'internal error' }],
] as const) {
  test(`text route maps ${failure.constructor.name} and preserves private response headers`, async (t) => {
    const origin = await startTestServer(textApp(async () => { throw failure; }), t);
    const response = await fetch(`${origin}${URL_PATH}`);
    assertAdminResponse({ actual: { statusCode: response.status, jsonBody: await response.json() }, expected: { statusCode: status, jsonBody: body } }, { failure: {"message":"The media could not be loaded.","action":"Try loading them again. If it still fails, copy details and report this problem.","step":"Load media"} });
    assert.deepEqual({ 'Cache-Control': response.headers.get('cache-control'), 'X-Content-Type-Options': response.headers.get('x-content-type-options') },
      { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  });
}

/** The query string Express 4's default (`qs`) parser reads back as `offset`. */
const offsetQuery = (offset: string | string[] | Record<string, string>): string => {
  if (typeof offset === 'string') return `offset=${encodeURIComponent(offset)}`;
  if (Array.isArray(offset)) return offset.map((value) => `offset=${encodeURIComponent(value)}`).join('&');
  return Object.entries(offset).map(([key, value]) => `offset%5B${key}%5D=${encodeURIComponent(value)}`).join('&');
};

for (const offset of ['', '-1', '1.5', '1e3', ['0', '1'], { value: '0' }]) {
  test(`text route refuses a nondecimal offset ${JSON.stringify(offset)} before reading bytes`, async (t) => {
    const origin = await startTestServer(textApp(async () => assert.fail('invalid offset must not read')), t);
    const response = await fetch(`${origin}${URL_PATH}?${offsetQuery(offset)}`);
    assert.deepEqual({ statusCode: response.status, jsonBody: await response.json() }, { statusCode: 400, jsonBody: { error: 'offset must be a non-negative byte offset' } });
  });
}
