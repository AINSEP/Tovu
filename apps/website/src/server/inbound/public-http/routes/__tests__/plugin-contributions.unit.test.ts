/** Pins the /api/p HTTP contract of registerPluginContributionRoutes and the member/admin auth
 * ports: status codes, Cache-Control, error bodies, generation checks and error redaction. */
import '../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import express, { type RequestHandler } from 'express';
import {
  createPluginContributionRegistry, InMemoryPluginActivationRepo,
  type PluginActivationRepoPort, type PluginContributionRegistry, type PluginContributionsSnapshot,
  type PluginRouteContribution, type PluginSdk,
} from '@jini-ai/plugins/host';
import { createRouteDeps } from '../../../../runtime/composition/app.js';
import type { RouteDeps } from '../../../../routes/types.js';
import { loginAsOwner, startTestServer } from '../../../../__tests__/helpers/http-test-server.js';
import { registerAuthRoutes } from '../../../admin-http/dev-auth.js';
import { parsePublicJsonBody } from '../../../shared/json-body-parsers.js';
import { MEMBER_SESSION_COOKIE } from '../members/complete-sign-in.js';
import { createPluginRouteAuthPorts, registerPluginContributionRoutes, type PluginRouteAuthPorts } from '../plugin-contributions.js';

const workspaceId = 'site';
const pluginId = 'pin-plugin';
const sdk: PluginSdk = {
  providers: { register: () => {} },
  content: { read: () => ({ workspaceId, ext: {} }), extend: () => {} },
  addFilter: () => {}, addAction: () => {}, addContribution: () => {},
  routes: { add: () => {} }, tools: { add: () => {} }, widgets: { add: () => {} },
};
const snapshotOf = (routes: readonly PluginRouteContribution[]): PluginContributionsSnapshot =>
  ({ pluginId, sdk, routes, tools: [], widgets: [] });
const route = (overrides: Partial<PluginRouteContribution>): PluginRouteContribution =>
  ({ method: 'POST', path: '/echo', access: 'public', handler: async () => ({ body: { ok: true } }), ...overrides });

const passAuth: PluginRouteAuthPorts = {
  admin: (_req, res, next) => { res.locals.principal = { id: 'operator' }; next(); },
  member: (_req, res, next) => { res.locals.pluginMemberId = 'member-1'; next(); },
};

interface HarnessOptions {
  routes?: readonly PluginRouteContribution[];
  auth?: PluginRouteAuthPorts;
  activationRepo?: PluginActivationRepoPort;
  withoutContributions?: boolean;
  onError?: (failure: { pluginId: string; error: unknown }) => void;
  enabled?: boolean;
}
async function harness(t: TestContext, options: HarnessOptions = {}) {
  const contributions = createPluginContributionRegistry({});
  const snapshot = snapshotOf(options.routes ?? [route({})]);
  contributions.replace({ contributions: snapshot });
  const activationRepo = options.activationRepo ?? new InMemoryPluginActivationRepo();
  await activationRepo.save({ pluginId, workspaceId, version: '1.0.0', enabled: options.enabled ?? true, updatedAt: '2026-10-20T00:00:00.000Z' });
  const deps = options.withoutContributions ? { workspaceId, pluginActivationRepo: activationRepo } : { workspaceId, pluginActivationRepo: activationRepo, pluginContributions: contributions };
  const app = express();
  registerPluginContributionRoutes({ app, deps, auth: options.auth ?? passAuth }, options.onError ? { onError: options.onError } : {});
  const baseUrl = await startTestServer(app, t);
  const call = (path: string, init: RequestInit = {}) => fetch(`${baseUrl}/api/p/${pluginId}${path}`, { method: 'POST', ...init });
  return { call, contributions, activationRepo, snapshot };
}
const jsonPost = (body: string, type = 'application/json'): RequestInit => ({ method: 'POST', headers: { 'content-type': type }, body });

test('public route returns the handler status and body with Cache-Control no-store', async t => {
  const h = await harness(t, { routes: [route({ handler: async () => ({ status: 201, body: { created: true } }) })] });
  const response = await h.call('/echo');
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { created: true });
});

test('a result without status or body is 200 with a JSON null body', async t => {
  const h = await harness(t, { routes: [route({ handler: async () => ({}) })] });
  const response = await h.call('/echo');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'null');
});

test('an undefined result is 204 with an empty body', async t => {
  const h = await harness(t, { routes: [route({ handler: async () => undefined })] });
  const response = await h.call('/echo');
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), '');
});

test('the handler receives plugin id, sdk, public auth context without a principal, body, params and query', async t => {
  const seen: unknown[] = [];
  const h = await harness(t, { routes: [route({ path: '/items/:itemId', handler: async input => { seen.push(input); return undefined; } })] });
  await h.call('/items/42?x=1', jsonPost(JSON.stringify({ a: 1 })));
  assert.deepEqual(seen, [{ pluginId, sdk, auth: { access: 'public', workspaceId }, body: { a: 1 }, params: { itemId: '42' }, query: { x: '1' } }]);
});

test('admin routes pass the operator principal id and expose the plugin owner id to the guard', async t => {
  const auths: unknown[] = []; const owners: unknown[] = [];
  const auth: PluginRouteAuthPorts = { ...passAuth, admin: (_req, res, next) => { owners.push(res.locals.pluginOwnerId); res.locals.principal = { id: 'operator' }; next(); } };
  const h = await harness(t, { auth, routes: [route({ access: 'admin', handler: async ({ auth: context }) => { auths.push(context); return undefined; } })] });
  assert.equal((await h.call('/echo')).status, 204);
  assert.deepEqual(owners, [pluginId]);
  assert.deepEqual(auths, [{ access: 'admin', workspaceId, principalId: 'operator' }]);
});

test('admin routes pass an undefined principal id when the admin port set no principal', async t => {
  const auths: unknown[] = [];
  const auth: PluginRouteAuthPorts = { ...passAuth, admin: (_req, _res, next) => next() };
  const h = await harness(t, { auth, routes: [route({ access: 'admin', handler: async ({ auth: context }) => { auths.push(context); return undefined; } })] });
  await h.call('/echo');
  assert.deepEqual(auths, [{ access: 'admin', workspaceId, principalId: undefined }]);
});

test('member routes pass the member id resolved by the member port', async t => {
  const auths: unknown[] = [];
  const h = await harness(t, { routes: [route({ access: 'member', handler: async ({ auth: context }) => { auths.push(context); return undefined; } })] });
  await h.call('/echo');
  assert.deepEqual(auths, [{ access: 'member', workspaceId, principalId: 'member-1' }]);
});

test('a rejecting auth port response is returned as-is and the handler never runs', async t => {
  let ran = false;
  const auth: PluginRouteAuthPorts = { ...passAuth, member: (_req, res) => { res.status(401).json({ code: 'UNAUTHENTICATED' }); } };
  const h = await harness(t, { auth, routes: [route({ access: 'member', handler: async () => { ran = true; return undefined; } })] });
  const response = await h.call('/echo');
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: 'UNAUTHENTICATED' });
  assert.equal(ran, false);
});

test('GET routes are registered under their own method', async t => {
  const h = await harness(t, { routes: [route({ method: 'GET', path: '/read' })] });
  assert.equal((await h.call('/read', { method: 'GET' })).status, 200);
  assert.equal((await h.call('/read')).status, 404);
});

test('unknown plugin paths are 404 NOT_FOUND', async t => {
  const h = await harness(t);
  const response = await h.call('/missing');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: 'NOT_FOUND' });
});

test('without a contribution registry every /api/p path is 404 NOT_FOUND', async t => {
  const h = await harness(t, { withoutContributions: true });
  const response = await h.call('/echo');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: 'NOT_FOUND' });
});

test('a disabled activation row is 404 NOT_FOUND before auth and the handler run', async t => {
  let guarded = false; let ran = false;
  const auth: PluginRouteAuthPorts = { ...passAuth, admin: (_req, _res, next) => { guarded = true; next(); } };
  const h = await harness(t, { enabled: false, auth, routes: [route({ access: 'admin', handler: async () => { ran = true; return undefined; } })] });
  const response = await h.call('/echo');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: 'NOT_FOUND' });
  assert.equal(guarded, false); assert.equal(ran, false);
});

test('an activation lookup failure before auth is 500 PLUGIN_ROUTE_FAILED', async t => {
  const repo = new InMemoryPluginActivationRepo();
  const failing: PluginActivationRepoPort = { save: record => repo.save(record), deleteActivation: input => repo.deleteActivation(input), listAll: () => repo.listAll(), getActivation: async () => { throw new Error('db down'); } };
  const h = await harness(t, { activationRepo: failing });
  const response = await h.call('/echo');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { code: 'PLUGIN_ROUTE_FAILED' });
});

/** Activation repo whose answers come from a scripted queue, to model a disable racing a request. */
function scriptedActivation(answers: ReadonlyArray<boolean | Error>): PluginActivationRepoPort {
  const repo = new InMemoryPluginActivationRepo(); let index = 0;
  return {
    save: record => repo.save(record), deleteActivation: input => repo.deleteActivation(input), listAll: () => repo.listAll(),
    getActivation: async () => {
      const answer = answers[Math.min(index++, answers.length - 1)];
      if (answer instanceof Error) throw answer;
      return { pluginId, workspaceId, version: '1.0.0', enabled: answer ?? false, updatedAt: '2026-10-20T00:00:00.000Z' };
    },
  };
}

test('a plugin disabled between the gate and invocation is 404 and the handler never runs', async t => {
  let ran = false;
  const h = await harness(t, { activationRepo: scriptedActivation([true, false]), routes: [route({ handler: async () => { ran = true; return undefined; } })] });
  const response = await h.call('/echo');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: 'NOT_FOUND' });
  assert.equal(ran, false);
});

test('a generation retired between the gate and invocation is 404 and the handler never runs', async t => {
  let ran = false; let registry: PluginContributionRegistry | undefined;
  const auth: PluginRouteAuthPorts = { ...passAuth, member: (_req, _res, next) => { registry?.replace({ contributions: snapshotOf([route({})]) }); next(); } };
  const h = await harness(t, { auth, routes: [route({ access: 'member', handler: async () => { ran = true; return undefined; } })] });
  registry = h.contributions;
  const response = await h.call('/echo');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: 'NOT_FOUND' });
  assert.equal(ran, false);
});

test('a generation replaced while the handler awaited does not emit the retired result', async t => {
  let registry: PluginContributionRegistry | undefined;
  const h = await harness(t, { routes: [route({ handler: async () => { registry?.replace({ contributions: snapshotOf([route({})]) }); return { body: 'stale' }; } })] });
  registry = h.contributions;
  const response = await h.call('/echo');
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), null);
  assert.deepEqual(await response.json(), { code: 'NOT_FOUND' });
});

test('a plugin disabled while the handler awaited does not emit the result', async t => {
  const h = await harness(t, { activationRepo: scriptedActivation([true, true, false]) });
  const response = await h.call('/echo');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: 'NOT_FOUND' });
});

test('a handler failure is reported to onError with the plugin id and redacted as 500', async t => {
  const failures: Array<{ pluginId: string; error: unknown }> = [];
  const boom = new Error('private detail');
  const h = await harness(t, { onError: failure => { failures.push(failure); }, routes: [route({ handler: async () => { throw boom; } })] });
  const response = await h.call('/echo');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { code: 'PLUGIN_ROUTE_FAILED' });
  assert.deepEqual(failures, [{ pluginId, error: boom }]);
});

test('a handler failure without onError is logged with console.warn naming the plugin', async t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const boom = new Error('private detail');
  const h = await harness(t, { routes: [route({ handler: async () => { throw boom; } })] });
  assert.equal((await h.call('/echo')).status, 500);
  assert.deepEqual(warn.mock.calls.map(call => call.arguments), [[`[plugins] Plugin '${pluginId}' route failed`, boom]]);
});

test('an activation lookup failure after the gate is reported and redacted as 500', async t => {
  const failures: Array<{ pluginId: string; error: unknown }> = [];
  const h = await harness(t, { onError: failure => { failures.push(failure); }, activationRepo: scriptedActivation([true, new Error('db down')]) });
  const response = await h.call('/echo');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { code: 'PLUGIN_ROUTE_FAILED' });
  assert.equal(failures.length, 1);
});

test('malformed JSON is 400 INVALID_BODY', async t => {
  const h = await harness(t);
  const response = await h.call('/echo', jsonPost('{'));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 'INVALID_BODY' });
});

test('a body over the public cap is 413 PAYLOAD_TOO_LARGE', async t => {
  const h = await harness(t);
  const response = await h.call('/echo', jsonPost('x'.repeat(140000), 'text/plain'));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { code: 'PAYLOAD_TOO_LARGE', error: 'Request body is too large.' });
});

test('text, form and octet-stream bodies are parsed for the handler', async t => {
  const bodies: unknown[] = [];
  const h = await harness(t, { routes: [route({ handler: async ({ body }) => { bodies.push(body); return undefined; } })] });
  await h.call('/echo', jsonPost('hello', 'text/plain'));
  await h.call('/echo', jsonPost('a=1', 'application/x-www-form-urlencoded'));
  await h.call('/echo', jsonPost('raw', 'application/octet-stream'));
  assert.equal(bodies[0], 'hello');
  assert.deepEqual({ ...(bodies[1] as object) }, { a: '1' });
  assert.deepEqual(bodies[2], Buffer.from('raw'));
});

test('an auth port error that is not a parse failure is 500 PLUGIN_ROUTE_FAILED', async t => {
  const auth: PluginRouteAuthPorts = { ...passAuth, member: (_req, _res, next) => next(new Error('resolver down')) };
  const h = await harness(t, { auth, routes: [route({ access: 'member' })] });
  const response = await h.call('/echo');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { code: 'PLUGIN_ROUTE_FAILED' });
});

test('an error raised after the response was sent is left to Express and the sent response stands', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const auth: PluginRouteAuthPorts = { ...passAuth, member: (_req, res, next) => { res.status(202).json({ sent: true }); next(new Error('late')); } };
  const h = await harness(t, { auth, routes: [route({ access: 'member' })] });
  const response = await h.call('/echo');
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { sent: true });
  // Express's final handler logs the late error after the response has already been flushed.
  for (let attempt = 0; attempt < 100 && logged.mock.callCount() === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(String(logged.mock.calls[0]?.arguments[0]).startsWith('Error: late'), true);
});

/** The member/admin ports over real route deps, with one repo swapped for a failing double. */
async function portsHarness(t: TestContext, deps: RouteDeps, access: 'member' | 'admin') {
  const echo: RequestHandler = (_req, res) => { res.json({ member: res.locals.pluginMemberId ?? null, owner: res.locals.pluginOwnerId ?? null }); };
  const ports = createPluginRouteAuthPorts({ deps });
  const app = express();
  app.use((_req, res, next) => { res.locals.pluginOwnerId = pluginId; next(); });
  app.post('/probe', ports[access], echo);
  app.use(((error, _req, res, _next) => { res.status(599).json({ message: (error as Error).message }); }) satisfies express.ErrorRequestHandler);
  return startTestServer(app, t);
}

test('member port answers 401 UNAUTHENTICATED without a member session cookie', async t => {
  const baseUrl = await portsHarness(t, createRouteDeps(), 'member');
  const response = await fetch(`${baseUrl}/probe`, { method: 'POST' });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: 'UNAUTHENTICATED' });
});

test('member port answers 401 when the session resolves to a member that no longer exists', async t => {
  const deps = createRouteDeps();
  const now = deps.clock.nowIso();
  await deps.memberSessionRepo.save({ id: 'session-ghost', workspaceId: deps.workspaceId, memberId: 'ghost', tokenHash: createHash('sha256').update('ghost-token').digest('hex'), createdAt: now, expiresAt: new Date(Date.parse(now) + 600000).toISOString() });
  const baseUrl = await portsHarness(t, deps, 'member');
  const response = await fetch(`${baseUrl}/probe`, { method: 'POST', headers: { cookie: `${MEMBER_SESSION_COOKIE}=ghost-token` } });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: 'UNAUTHENTICATED' });
});

test('member port forwards a member lookup failure to next(error)', async t => {
  const base = createRouteDeps();
  const deps: RouteDeps = { ...base, memberSessionRepo: { ...base.memberSessionRepo, findByTokenHash: async () => { throw new Error('session store down'); } } };
  const baseUrl = await portsHarness(t, deps, 'member');
  const response = await fetch(`${baseUrl}/probe`, { method: 'POST', headers: { cookie: `${MEMBER_SESSION_COOKIE}=any` } });
  assert.equal(response.status, 599);
  assert.deepEqual(await response.json(), { message: 'session store down' });
});

test('admin port forwards an operator authorization failure to next(error)', async t => {
  const base = createRouteDeps();
  const deps: RouteDeps = { ...base, authorize: async () => { throw new Error('authorizer down'); } };
  const app = express();
  app.use(parsePublicJsonBody); registerAuthRoutes(app, deps);
  const ports = createPluginRouteAuthPorts({ deps });
  app.post('/probe', ports.admin, (_req, res) => { res.json({ reached: true }); });
  app.use(((error, _req, res, _next) => { res.status(599).json({ message: (error as Error).message }); }) satisfies express.ErrorRequestHandler);
  const baseUrl = await startTestServer(app, t);
  await deps.identityReady;
  const cookie = await loginAsOwner(baseUrl);
  const response = await fetch(`${baseUrl}/probe`, { method: 'POST', headers: { cookie } });
  assert.equal(response.status, 599);
  assert.deepEqual(await response.json(), { message: 'authorizer down' });
});

test('admin port forwards an operator session parse failure to next(error)', async t => {
  const deps = createRouteDeps();
  const app = express();
  app.use(parsePublicJsonBody); registerAuthRoutes(app, deps);
  app.post('/api/p/probe', createPluginRouteAuthPorts({ deps }).admin, (_req, res) => { res.json({ reached: true }); });
  app.use(((error, _req, res, _next) => { res.status(599).json({ type: (error as { type?: string }).type }); }) satisfies express.ErrorRequestHandler);
  const baseUrl = await startTestServer(app, t);
  await deps.identityReady;
  const cookie = await loginAsOwner(baseUrl);
  const response = await fetch(`${baseUrl}/api/p/probe`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{' });
  assert.equal(response.status, 599);
  assert.deepEqual(await response.json(), { type: 'entity.parse.failed' });
});
