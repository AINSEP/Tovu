import assert from 'node:assert/strict';
import test from 'node:test';
import { tmpdir } from 'node:os';
import express from 'express';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import type { SitesWorkspace } from '#src/platform/site-dir/sites-home';
import { registerLocalSitesRoutes, type LocalSitesRouteDeps } from '../../local-sites.js';
import { registerSitesHomeRoutes } from '../../sites-home.js';

const ROOT = '/api/admin/v1/workspaces/:workspaceId/system/sites';

for (const [body, status] of [[{}, 400], [{ checked: true }, 400], [{ confirmed: true }, 400], [{ checked: true, confirmed: true }, 200]] as const) {
  test(`permanent site deletion requires both confirmations: ${JSON.stringify(body)}`, async () => {
    const events: unknown[] = [];
    const app = express();
    registerLocalSitesRoutes({ app, deps: portFake<LocalSitesRouteDeps>({
      workspaceId: 'ws', siteBinding: { name: 'owner', dir: '/repo/sites/owner', dirOverridden: false, switcherCompatible: true },
      isSiteSwitcherEnabled: () => true, authorize: async () => ({ allowed: true, reason: 'owner' }),
      localSiteSupervisor: { withStoppedSite: async ({ name, task }: { name: string; task: () => Promise<unknown> }) => {
        events.push(['stop', name]); return task();
      } },
      siteTrash: { remove: (input: Parameters<NonNullable<LocalSitesRouteDeps['siteTrash']>['remove']>[0]) => { events.push(['remove', input]); }, trash: () => assert.fail('must not trash'), restore: () => assert.fail('must not restore') },
    }) });
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: 'owner' };
    const id = 'alpha--00000000-0000-0000-0000-000000000000';
    await extractRouteHandler(app, 'post', `${ROOT}/trash/:id/delete`)({ params: { workspaceId: 'ws', id }, body }, res);
    assert.deepEqual(capture, { statusCode: status, jsonBody: status === 200 ? { ok: true } : { error: 'SITE_CONFIRM_REQUIRED', code: 'SITE_CONFIRM_REQUIRED' } });
    assert.deepEqual(events, status === 200 ? [['stop', 'alpha'], ['remove', { base: '/repo', id, checked: true, confirmed: true }]] : []);
  });
}

test('sites settings validate every root before calling the settings writer', async () => {
  const app = express();
  let writes = 0;
  registerSitesHomeRoutes({ app, deps: { workspaceId: 'ws', isSiteSwitcherEnabled: () => true,
    authorize: async () => ({ allowed: true, reason: 'owner' }) },
    workspace: portFake<SitesWorkspace>({ updateConfig: () => { writes++; assert.fail('invalid second root must stop the update'); } }),
  });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: 'owner' };
  await extractRouteHandler(app, 'put', `${ROOT}/config`)({ params: { workspaceId: 'ws' }, body: { siteRoots: [tmpdir(), 'relative'] } }, res);
  assert.deepEqual(capture, { statusCode: 400, jsonBody: { error: 'Choose an absolute folder path for sites settings.' } });
  assert.equal(writes, 0);
});
