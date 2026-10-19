import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { createRouteDeps } from '#src/server/runtime/composition/app';

/** Shared admin-route failure fixture: authorization errors, denied grants and workspace isolation. */
export const WS = 'workspace-local';
export const BASE = `/api/admin/v1/workspaces/${WS}`;
export const INTERNAL = { error: 'internal error' };
export const INTERNAL_CODE = { ...INTERNAL, code: 'INTERNAL_ERROR' };
export const allowed = async () => ({ allowed: true, reason: 'matched' });
export const limiter = { check: async () => ({ allowed: true as const }) };
export type Deps = ReturnType<typeof createRouteDeps>;
export type Register = (app: express.Express, deps: Deps) => void;

// Reuse the composition's in-memory ports and the existing native HTTP dispatcher.
// Scenario overrides replace only the boundary whose failure or input is under test.
export function fixture(register: Register, overrides: Record<string, unknown> = {}) {
  const deps = { ...createRouteDeps(), authorize: allowed, ...overrides } as Deps;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: 'owner' }; next(); });
  register(app, deps);
  return { deps, app };
}


export type RouteFailureCase = { name: string; register: Register; method: string; path: string; body?: unknown; coded?: boolean };

/** Every admin route keeps authorization failures private, stops on denial and isolates workspaces. */
export function testRouteFailureMatrix(routes: readonly RouteFailureCase[]): void {
  for (const route of routes) {
    test(`${route.name}: authorization failure is private and does not become a success`, async () => {
      const { app } = fixture(route.register, { authorize: async () => { throw new Error('private credential'); } });
      assert.deepEqual(await dispatchJsonRequest(app, route.method, route.path, route.body), {
        status: 500,
        body: route.name.startsWith('entries') ? { error: 'private credential', code: 'INTERNAL_ERROR' } : route.coded ? INTERNAL_CODE : INTERNAL,
      });
    });
    test(`${route.name}: denied permission stops before reaching repositories`, async () => {
      let calls = 0;
      const { app } = fixture(route.register, { authorize: async () => { calls++; return { allowed: false, reason: 'no_grant' }; } });
      const result = await dispatchJsonRequest(app, route.method, route.path, route.body);
      assert.equal(result.status, 403);
      assert.equal((result.body as { code: string }).code, 'FORBIDDEN');
      assert.equal(calls, 1);
    });
    if (route.path.startsWith(BASE)) {
      test(`${route.name}: workspace isolation precedes authorization`, async () => {
        let calls = 0;
        const { app } = fixture(route.register, { authorize: async () => { calls++; return { allowed: true }; } });
        assert.deepEqual(await dispatchJsonRequest(app, route.method, route.path.replace(BASE, '/api/admin/v1/workspaces/other'), route.body), {
          status: 404, body: { error: 'workspace was not found' },
        });
        assert.equal(calls, 0);
      });
    }
  }
  
}
