import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { createCapturingResponse, type DirectInvokeCapture } from '#src/server/__tests__/helpers/http-test-server';
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
      test(`${route.name}: \`req.params.workspaceId ?? ""\` fallback, forced via a direct handler call, is the workspace 404 before authorization`, async () => {
        let calls = 0;
        const { app } = fixture(route.register, { authorize: async () => { calls++; return { allowed: true }; } });
        assert.deepEqual(await invokeRouteDirectly({ app, method: route.method, path: route.path, req: { params: {}, query: {}, body: route.body } }), {
          statusCode: 404, jsonBody: { error: 'workspace was not found' },
        });
        assert.equal(calls, 0);
      });
    }
  }
  
}

/** The slice of Express 4's router stack {@link invokeRouteDirectly} walks (`Layer#match` + the route's handlers). */
interface RouterStackLayer {
  match(path: string): boolean;
  route?: { methods: Record<string, boolean>; stack: Array<{ handle: (req: unknown, res: unknown) => unknown }> };
}

/**
 * Calls the real route handler registered for `method` + concrete `path` with a hand-built `req`, bypassing
 * Express's routing (and therefore its `:param` population) entirely. Same narrow purpose as
 * `extractRouteHandler` (`helpers/http-test-server.ts`): Express guarantees a matched `:param` is always
 * populated, so a route's `String(req.params.X ?? "")` fallback is unreachable through any real request --
 * the repo KEEPS those guards (restored 2026-09-03 after being wrongly deleted as dead code) and exercises
 * them by deliberately violating that contract here. Locates the route by matching the concrete path (so
 * the matrix's own `path` can be reused) and invokes the route's LAST handler, i.e. the route body itself.
 */
export async function invokeRouteDirectly(
  { app, method, path, req, principalId = 'owner' }: { app: express.Express; method: string; path: string; req: Record<string, unknown>; principalId?: string },
): Promise<DirectInvokeCapture> {
  const stack = (app as unknown as { _router: { stack: RouterStackLayer[] } })._router.stack;
  const layer = stack.find((candidate) => candidate.route?.methods[method.toLowerCase()] && candidate.match(path));
  const handlers = layer?.route?.stack ?? [];
  const handler = handlers[handlers.length - 1];
  if (!handler) throw new Error(`invokeRouteDirectly: no ${method} route registered for "${path}"`);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: principalId };
  // Some routes set response headers before their workspace check (e.g. media text's cache policy);
  // accept them so the guard under test, not a missing `res.set`, decides the response.
  Object.assign(res, { set: () => res });
  await handler.handle(req, res);
  return capture;
}
