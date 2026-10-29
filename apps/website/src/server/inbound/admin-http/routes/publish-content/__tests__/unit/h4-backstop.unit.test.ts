import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import { BACKSTOP_FORBIDDEN } from '#src/features/publish-content/backstop-service';
import type { PublishContentRouteDeps } from '../../deps.js';
import { registerPublishBackstopRoutes } from '../../backstop.js';

for (const [role, allowed] of [[null, false], [{ name: 'admin', isBuiltin: false }, false],
  [{ name: 'viewer', isBuiltin: true }, false], [{ name: 'admin', isBuiltin: true }, true], [{ name: 'owner', isBuiltin: true }, true]] as const) {
  test(`backstop non-owner admission checks live roles: ${JSON.stringify(role)}`, async () => {
    const reads: unknown[] = [];
    const app = express();
    registerPublishBackstopRoutes(app, portFake<PublishContentRouteDeps>({ workspaceId: 'ws', ownerPrincipalId: Promise.resolve('owner'),
      authorize: async input => { reads.push(input); return { allowed: true, reason: 'grant' }; },
      principalRoleRepo: { listByPrincipalId: async (input: unknown) => { reads.push(input); return [{ roleId: 'deleted' }, { roleId: 'candidate' }]; } },
      roleRepo: { findById: async (input: { id: string }) => { reads.push(input); return input.id === 'candidate' ? role : null; } },
    }));
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: 'operator' }; res.locals.authCredentialKind = 'session';
    await extractRouteHandler(app, 'get', '/api/admin/v1/workspaces/:workspaceId/publish-content/backstop/status')({ params: { workspaceId: 'ws' } }, res);
    assert.deepEqual(capture, allowed ? { statusCode: 200, jsonBody: { allowed: true, installed: false } }
      : { statusCode: 403, jsonBody: { error: BACKSTOP_FORBIDDEN, code: 'FORBIDDEN' } });
    assert.deepEqual(reads, [
      { principalId: 'operator', permission: 'publish.backstop', workspaceId: 'ws' },
      { workspaceId: 'ws', principalId: 'operator' },
      { workspaceId: 'ws', id: 'deleted' }, { workspaceId: 'ws', id: 'candidate' },
    ]);
  });
}
