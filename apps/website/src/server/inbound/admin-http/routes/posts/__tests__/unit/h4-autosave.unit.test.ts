import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createCapturingResponse } from '#src/server/__tests__/helpers/http-test-server';
import { lastRouteHandler } from '#src/server/__tests__/helpers/last-route-handler';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import type { ContentRouteDeps } from '../../../content/deps.js';
import { registerAdminPostAutosaveRoute } from '../../autosave.js';

const PATH = '/api/admin/v1/workspaces/:workspaceId/posts/:postId/autosave';
const VALID = { bodyFormat: 'html', title: 'Unsaved title', slug: 'draft', bodyHtml: '<p>Draft</p>', baseVersion: 3 };

for (const byline of [{ author: 7 }, { showAuthor: 'true' }, { author: 'x'.repeat(201) }]) {
  test(`autosave refuses invalid byline ${JSON.stringify(byline)} before a write`, async () => {
    const app = express();
    registerAdminPostAutosaveRoute(app, portFake<ContentRouteDeps>({ workspaceId: 'ws',
      authorize: async () => ({ allowed: true, reason: 'owner' }),
      postRepo: { writeAutosave: async () => assert.fail('invalid byline must not be parked') },
    }));
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: 'owner' };
    await lastRouteHandler(app, 'put', PATH)({ params: { workspaceId: 'ws', postId: 'draft' }, body: { ...VALID, ...byline } }, res);
    assert.equal(capture.statusCode, 400);
    assert.equal((capture.jsonBody as { code: string }).code, 'VALIDATION_ERROR');
    assert.equal((capture.jsonBody as { error: string }).error, 'author' in byline && typeof byline.author === 'string' ? 'author must be at most 200 characters' : 'invalid autosave body');
  });
}

test('autosave parks by raw id after lookup failure, retaining the normalized byline', async () => {
  const writes: unknown[] = [];
  const lookups: unknown[] = [];
  const app = express();
  registerAdminPostAutosaveRoute(app, portFake<ContentRouteDeps>({ workspaceId: 'ws',
    authorize: async () => ({ allowed: true, reason: 'owner' }),
    clock: { nowIso: () => '2026-10-28T00:00:00.000Z' },
    postRepo: { findBySlug: async (input: unknown) => { lookups.push(input); return null; },
      findById: async (input: unknown) => { lookups.push(input); throw new Error('lookup failed'); },
      writeAutosave: async (input: unknown) => { writes.push(input); return { applied: false }; } },
  }));
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: 'owner' };
  await lastRouteHandler(app, 'put', PATH)({ params: { workspaceId: 'ws', postId: 'raw-id' }, body: { ...VALID, author: ' Ada ', showAuthor: false } }, res);
  assert.deepEqual(capture, { statusCode: 200, jsonBody: { applied: false } });
  assert.deepEqual(lookups, [{ workspaceId: 'ws', slug: 'raw-id' }, { workspaceId: 'ws', id: 'raw-id' }]);
  assert.deepEqual(writes, [{ workspaceId: 'ws', id: 'raw-id', snapshot: { ...VALID, author: 'Ada', showAuthor: false,
    savedAt: '2026-10-28T00:00:00.000Z', savedByPrincipalId: 'owner' } }]);
});
