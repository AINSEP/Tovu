import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { VaultRepoPort } from '@jini-ai/platform/secrets/credential-sets';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import type { LoadedDeployTarget, DeployTargetRegistry } from '#src/features/deployments/deploy-targets/types';
import { registerAdminPublishSiteRoutes, type AdminPublishSiteDeps } from '../../publish-site.js';

const ROOT = '/api/admin/v1/workspaces/:workspaceId/system';
const TARGET: LoadedDeployTarget = { pluginId: 'fixture',
  descriptor: { id: 'fixture', label: 'Fixture', module: 'fixture.mjs', configFields: [],
    credential: { vendorId: 'fixture', tokenField: 'token', fields: [{ name: 'token', label: 'Token', secret: true, required: true }] } },
  module: { create: () => assert.fail('preview must not create a deployment') },
};
const registry: DeployTargetRegistry = { get: id => id === 'fixture' ? TARGET : undefined, list: () => [TARGET], refusals: ['private plugin path refused'] };

test('publish preview logs registry refusals and redacts credential metadata read failures', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const app = express();
  let reads = 0;
  registerAdminPublishSiteRoutes(app, portFake<AdminPublishSiteDeps>({ workspaceId: 'ws', publishExecutionMode: 'hosted-api-only',
    authorize: async () => ({ allowed: true, reason: 'owner' }), loadDeployTargets: async () => registry,
    vendorCredentialSetRepo: { vault: portFake<VaultRepoPort>({ list: async () => { reads++; throw new Error('private credential database'); } }) },
  }));
  const { res, capture } = createCapturingResponse(); res.locals.principal = { id: 'owner' };
  await extractRouteHandler(app, 'get', `${ROOT}/publish/preview`)({ params: { workspaceId: 'ws' }, query: { target: 'fixture' } }, res);
  assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: 'internal error', code: 'INTERNAL_ERROR' } });
  assert.equal(reads, 1);
  assert.deepEqual(warnings.mock.calls.map(call => call.arguments), [['[publish-site] private plugin path refused']]);
});

for (const suffix of ['/publish', '/publish/preview', '/publish/destinations', '/publish-targets']) {
  test(`publish read ${suffix} refuses before registry or credential reads`, async () => {
    const app = express();
    const permissions: string[] = [];
    registerAdminPublishSiteRoutes(app, portFake<AdminPublishSiteDeps>({ workspaceId: 'ws', publishExecutionMode: 'hosted-api-only',
      authorize: async ({ permission }) => { permissions.push(permission); return { allowed: false, reason: 'no_grant' }; },
      loadDeployTargets: async () => assert.fail('denied request must not load providers'),
    }));
    const { res, capture } = createCapturingResponse(); res.locals.principal = { id: 'reader' };
    await extractRouteHandler(app, 'get', ROOT + suffix)({ params: { workspaceId: 'ws' }, query: { target: 'fixture' } }, res);
    const permission = suffix === '/publish' ? 'system.publish' : 'system.read';
    assert.deepEqual(capture, { statusCode: 403, jsonBody: { error: `principal 'reader' is not authorized for '${permission}' (no_grant)`, code: 'FORBIDDEN', details: { permission, reason: 'no_grant' } } });
    assert.deepEqual(permissions, [permission]);
  });
}
