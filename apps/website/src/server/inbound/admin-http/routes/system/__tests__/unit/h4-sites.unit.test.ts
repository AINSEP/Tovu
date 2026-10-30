import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import express from 'express';
import * as tokenCatalog from '#src/features/agent-plugins/new-site-agent-plugin-tokens';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import type { AdminSitesDeps } from '../../sites.js';
import { bundledAgentPluginsDir } from '#src/server/runtime/composition/site-paths';

const catalogReads: unknown[] = [];
mock.module('#src/features/agent-plugins/new-site-agent-plugin-tokens', { namedExports: { ...tokenCatalog,
  listNewSiteAgentPluginTokenSignInPlugins: async (...args: unknown[]) => { catalogReads.push(args); return []; },
} });
const { registerAdminSitesRoutes } = await import('../../sites.js');
const ROOT = '/api/admin/v1/workspaces/:workspaceId/system/sites';

test('sites uses the bundled token catalog when no catalog port override is supplied', async () => {
  catalogReads.length = 0;
  const app = express();
  registerAdminSitesRoutes(app, portFake<AdminSitesDeps>({ workspaceId: 'ws',
    siteBinding: { name: 'owner', dir: '/repo/sites/owner', dirOverridden: false, switcherCompatible: true },
    authorize: async () => ({ allowed: true, reason: 'owner' }), sitePreviews: null, devRestart: null,
  }));
  const { res, capture } = createCapturingResponse(); res.locals.principal = { id: 'owner' };
  await extractRouteHandler(app, 'get', `${ROOT}/token-sign-in-plugins`)({ params: { workspaceId: 'ws' } }, res);
  assert.deepEqual(capture, { statusCode: 200, jsonBody: { plugins: [] } });
  assert.deepEqual(catalogReads, [[{ bundledSourceRoot: bundledAgentPluginsDir() }]]);
});

for (const active of ['alpha', 'beta']) {
  test(`trashing alpha repairs next-launch selection only when persisted selection is ${active}`, async () => {
    let persisted = active;
    const writes: unknown[] = [];
    const app = express();
    registerAdminSitesRoutes(app, portFake<AdminSitesDeps>({ workspaceId: 'ws',
      siteBinding: { name: 'owner', dir: '/repo/sites/owner', dirOverridden: false, switcherCompatible: true },
      authorize: async () => ({ allowed: true, reason: 'owner' }), isSiteSwitcherEnabled: () => true,
      sitePreviews: null, devRestart: null,
      readPersistedActiveSite: () => persisted,
      persistActiveSite: (input, options) => { persisted = input.name; writes.push([input, options]); },
      localSiteSupervisor: { withStoppedSite: async ({ task }: { task: () => Promise<unknown> }) => task() },
      siteTrash: { trash: ({ name }: Parameters<NonNullable<AdminSitesDeps['siteTrash']>['trash']>[0]) => ({ id: 'trash-id', name, displayName: 'Alpha' }), restore: () => {}, remove: () => {} },
    }));
    const { res, capture } = createCapturingResponse(); res.locals.principal = { id: 'owner' };
    await extractRouteHandler(app, 'post', `${ROOT}/:name/trash`)({ params: { workspaceId: 'ws', name: 'alpha' }, body: { confirmed: true } }, res);
    assert.deepEqual(capture, { statusCode: 200, jsonBody: { site: { id: 'trash-id', name: 'alpha', displayName: 'Alpha' } } });
    assert.equal(persisted, active === 'alpha' ? 'owner' : 'beta');
    assert.deepEqual(writes, active === 'alpha' ? [[{ name: 'owner' }, { cwd: '/repo' }]] : []);
  });
}
