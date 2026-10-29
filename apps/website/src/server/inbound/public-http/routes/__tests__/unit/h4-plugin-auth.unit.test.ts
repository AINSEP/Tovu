import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Request, Response, NextFunction } from 'express';
import * as devAuth from '#src/server/inbound/admin-http/dev-auth';
import type { RouteDeps } from '#src/server/routes/types';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import { createCapturingResponse } from '#src/server/__tests__/helpers/http-test-server';

// The session owner supplies an authenticated operator. Plugin-specific permission checking
// stays real so this test detects accidental admission based on a session alone.
mock.module('#src/server/inbound/admin-http/dev-auth', { namedExports: { ...devAuth,
  requireAdminSession: () => (_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: 'operator' }; next();
  },
} });
const { createPluginRouteAuthPorts } = await import('../../plugin-contributions.js');

for (const outcome of ['allow', 'deny', 'error'] as const) {
  test(`plugin admin auth ${outcome} is scoped to the owning plugin`, { timeout: 1000 }, async () => {
    const asked: unknown[] = [];
    const failure = new Error('policy store unavailable');
    const deps = portFake<RouteDeps>({ workspaceId: 'ws', authorize: async input => {
      asked.push(input);
      if (outcome === 'error') throw failure;
      return { allowed: outcome === 'allow', reason: 'plugin-grant' };
    } });
    const { res, capture } = createCapturingResponse();
    res.locals.pluginOwnerId = 'plugin-a';
    const forwarded: unknown[] = [];
    await new Promise<void>(resolve => {
      const json = res.json.bind(res);
      res.json = ((body: unknown) => { json(body); resolve(); return res; }) as typeof res.json;
      createPluginRouteAuthPorts({ deps }).admin({} as Request, res, error => { forwarded.push(error); resolve(); });
    });
    assert.deepEqual(asked, [{ principalId: 'operator', permission: 'admin.plugins.enable', workspaceId: 'ws', entityType: 'plugin', entityId: 'plugin-a' }]);
    if (outcome === 'deny') {
      assert.deepEqual(capture, { statusCode: 403, jsonBody: { error: "principal 'operator' is not authorized for 'admin.plugins.enable' (plugin-grant)", code: 'FORBIDDEN', details: { permission: 'admin.plugins.enable', reason: 'plugin-grant' } } });
      assert.deepEqual(forwarded, []);
    } else {
      assert.deepEqual(forwarded, [outcome === 'error' ? failure : undefined]);
      assert.deepEqual(capture, { statusCode: 200, jsonBody: undefined });
    }
  });
}
