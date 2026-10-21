import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { registerAdminExternalMcpAdmissionsRoute } from '../admissions.js';
import { registerAdminExternalMcpDeleteRoute } from '../delete.js';
import { registerAdminExternalMcpListRoute } from '../list.js';
import { registerAdminExternalMcpPutRoute } from '../put.js';
import { registerAdminExternalMcpProbeRoute, createExternalMcpProbeLimiter } from '../probe.js';
import { registerAdminExternalMcpToolApprovalsRoutes } from '../tool-approvals.js';
import { registerAdminExternalMcpOAuthConnectRoute, registerAdminExternalMcpOAuthDevicePollRoute, registerAdminExternalMcpOAuthDisconnectRoute } from '../oauth.js';
import { OAuthError } from '@jini-ai/oauth';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { WS, BASE, INTERNAL_CODE, allowed, limiter, fixture, invokeRouteDirectly, testRouteFailureMatrix, type RouteFailureCase } from '#src/server/__tests__/helpers/admin-route-failures';

const routes: RouteFailureCase[] = [
  { name: 'MCP admissions', register: registerAdminExternalMcpAdmissionsRoute, method: 'GET', path: `${BASE}/mcp-servers/admissions`, coded: true },
  { name: 'MCP delete', register: registerAdminExternalMcpDeleteRoute, method: 'DELETE', path: `${BASE}/mcp-servers/server`, coded: true },
  { name: 'MCP list', register: registerAdminExternalMcpListRoute, method: 'GET', path: `${BASE}/mcp-servers`, coded: true },
  { name: 'MCP put', register: registerAdminExternalMcpPutRoute, method: 'PUT', path: `${BASE}/mcp-servers/server`, coded: true },
  { name: 'MCP approvals list', register: registerAdminExternalMcpToolApprovalsRoutes, method: 'GET', path: `${BASE}/mcp-servers/tool-approvals`, coded: true },
  { name: 'MCP approvals revoke', register: registerAdminExternalMcpToolApprovalsRoutes, method: 'DELETE', path: `${BASE}/mcp-servers/server/tool-approvals/tool`, coded: true },
  { name: 'MCP probe', register: (app, deps) => registerAdminExternalMcpProbeRoute(app, deps, limiter), method: 'POST', path: `${BASE}/mcp-servers/server/probe`, coded: true },
];

testRouteFailureMatrix(routes);

for (const method of ['GET', 'DELETE']) {
  test(`MCP approvals ${method}: store failure cannot masquerade as empty or removed`, async () => {
    const fail = async () => { throw new Error('private fingerprint'); };
    const { app } = fixture(registerAdminExternalMcpToolApprovalsRoutes, { externalMcpToolApprovalRepo: { listByWorkspaceId: fail, delete: fail } });
    const path = method === 'GET' ? `${BASE}/mcp-servers/tool-approvals` : `${BASE}/mcp-servers/server/tool-approvals/tool`;
    assert.deepEqual(await dispatchJsonRequest(app, method, path), { status: 500, body: INTERNAL_CODE });
  });
}

test('MCP probe: repository failure is a private 500 rather than an unreachable-vendor report', async () => {
  const { app } = fixture((app, deps) => registerAdminExternalMcpProbeRoute(app, deps, limiter), {
    externalMcpServerRepo: { findByServerId: async () => { throw new Error('secret'); } },
  });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/mcp-servers/server/probe`), { status: 500, body: INTERNAL_CODE });
});

test('MCP probe limiter uses the shared outbound call budget and restores it after the window', async () => {
  let now = 0;
  const probeLimiter = createExternalMcpProbeLimiter({ clock: { nowMs: () => now, nowIso: () => new Date(now).toISOString() } });
  // The shared profile is deliberately read from its owner, so this pins the route's choice.
  const { OUTBOUND_CALL_PER_IP } = await import('#src/contracts/core/rate-limit/rate-limit');
  for (let index = 0; index < OUTBOUND_CALL_PER_IP.max + OUTBOUND_CALL_PER_IP.burst; index++) {
    assert.deepEqual(await probeLimiter.check({ key: 'client' }), { allowed: true });
  }
  assert.equal((await probeLimiter.check({ key: 'client' })).allowed, false);
  assert.deepEqual(await probeLimiter.check({ key: 'another-client' }), { allowed: true });
  now += OUTBOUND_CALL_PER_IP.windowSeconds * 1000;
  assert.deepEqual(await probeLimiter.check({ key: 'client' }), { allowed: true });
});

for (const [name, register, method, suffix] of [
  ['connect', registerAdminExternalMcpOAuthConnectRoute, 'POST', '/connect'],
  ['poll', registerAdminExternalMcpOAuthDevicePollRoute, 'POST', '/device/poll'],
  ['disconnect', registerAdminExternalMcpOAuthDisconnectRoute, 'DELETE', ''],
] as const) {
  test(`MCP OAuth ${name}: wrong workspace and denied permission do not invoke the service`, async () => {
    let calls = 0;
    const service = { beginConnect: async () => { calls++; }, pollDeviceAuthorization: async () => { calls++; }, disconnect: async () => { calls++; } };
    const { app } = fixture((app, deps) => register(app, { ...deps, externalMcpOAuth: service } as any, limiter), {
      authorize: async () => ({ allowed: false, reason: 'no_grant' }),
    });
    const path = `${BASE}/mcp-servers/server/oauth${suffix}`;
    assert.deepEqual(await dispatchJsonRequest(app, method, path.replace(BASE, '/api/admin/v1/workspaces/other')), { status: 404, body: { error: 'workspace was not found' } });
    const denied = await dispatchJsonRequest(app, method, path);
    assert.equal(denied.status, 403);
    assert.equal((denied.body as { code: string }).code, 'FORBIDDEN');
    assert.equal(calls, 0);
  });
}

for (const retryAfterSeconds of [undefined, 7]) {
  test(`MCP OAuth: provider polling error preserves optional retry delay ${retryAfterSeconds}`, async () => {
    const error = new OAuthError({ code: 'OAUTH_SLOW_DOWN', message: 'poll less often', operatorAction: 'wait' }, { retryAfterSeconds });
    const { app } = fixture((app, deps) => registerAdminExternalMcpOAuthDevicePollRoute(app, {
      ...deps, externalMcpOAuth: { pollDeviceAuthorization: async () => { throw error; } },
    } as any, limiter));
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/mcp-servers/server/oauth/device/poll`), {
      status: 400, body: { error: 'poll less often', code: 'OAUTH_SLOW_DOWN', details: {
        retryable: true, operatorAction: 'wait', ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      } },
    });
  });
}

test('MCP probe: exhausted budget answers before checking permissions or connecting', async t => {
  let checks = 0;
  const { app } = fixture((app, deps) => registerAdminExternalMcpProbeRoute(app, deps, {
    check: async () => ({ allowed: false, retryAfterSeconds: 13 }),
  }), { authorize: async () => { checks++; return { allowed: true }; } });
  const origin = await startTestServer(app, t);
  const response = await fetch(`${origin}${BASE}/mcp-servers/server/probe`, { method: 'POST' });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '13');
  assert.deepEqual(await response.json(), { error: 'too many probe attempts', code: 'RATE_LIMIT_EXCEEDED', details: { retryAfterSeconds: 13 } });
  assert.equal(checks, 0);
});

for (const oauth of [undefined, null, [], 'invalid', {}, { clientId: 42 }]) {
  test(`MCP PUT: invalid or empty OAuth block preserves static configuration ${JSON.stringify(oauth)}`, async () => {
    const { app, deps } = fixture(registerAdminExternalMcpPutRoute);
    const result = await dispatchJsonRequest(app, 'PUT', `${BASE}/mcp-servers/server`, {
      command: 'node', args: '--version', allowedToolNames: 'read', oauth,
    });
    assert.equal(result.status, 200);
    const server = await deps.externalMcpServerRepo.findByServerId({ workspaceId: WS, serverId: 'server' });
    assert.ok(server);
    assert.equal(server.command, 'node');
    assert.equal(server.authMode, 'static_env');
    assert.equal((result.body as { restartRequired: boolean }).restartRequired, true);
  });
}

test('MCP PUT: absent body is rejected and never creates an empty command server', async () => {
  const { app, deps } = fixture(registerAdminExternalMcpPutRoute);
  const response = await dispatchJsonRequest(app, 'PUT', `${BASE}/mcp-servers/server`);
  assert.equal(response.status, 400);
  assert.equal((response.body as { code: string }).code, 'INVALID_MCP_SERVER');
  assert.equal(await deps.externalMcpServerRepo.findByServerId({ workspaceId: WS, serverId: 'server' }), null);
});

for (const [method, path, repo] of [
  ['GET', `${BASE}/mcp-servers`, { listByWorkspaceId: async () => { throw new Error('private'); } }],
  ['DELETE', `${BASE}/mcp-servers/server`, { deleteByServerId: async () => { throw new Error('private'); } }],
  ['PUT', `${BASE}/mcp-servers/server`, { findByServerId: async () => { throw new Error('private'); } }],
] as const) {
  test(`MCP ${method}: storage failure is a private 500`, async () => {
    const register = method === 'GET' ? registerAdminExternalMcpListRoute : method === 'DELETE' ? registerAdminExternalMcpDeleteRoute : registerAdminExternalMcpPutRoute;
    const { app } = fixture(register, { externalMcpServerRepo: repo });
    assert.deepEqual(await dispatchJsonRequest(app, method, path, { command: 'node' }), { status: 500, body: INTERNAL_CODE });
  });
}

for (const thrown of ['secret upstream body', new Error('secret upstream body')]) {
  test(`MCP OAuth unexpected ${typeof thrown} is never reflected to the operator`, async () => {
    const { app } = fixture((app, deps) => registerAdminExternalMcpOAuthDisconnectRoute(app, {
      ...deps, externalMcpOAuth: { disconnect: async () => { throw thrown; } },
    } as any));
    assert.deepEqual(await dispatchJsonRequest(app, 'DELETE', `${BASE}/mcp-servers/server/oauth`), { status: 500, body: INTERNAL_CODE });
  });
}

/**
 * `String(req.params.serverId ?? "")` / `String(req.params.toolName ?? "")` (extractRouteHandler's own
 * doc, `helpers/http-test-server.ts`): Express guarantees a matched `:param` is always populated, so the
 * right side of each `??` below is unreachable through any real HTTP request. Restored 2026-09-03 after
 * being wrongly deleted as "unreachable dead code" -- the repo's established answer is to KEEP the guard
 * and exercise it with a hand-built `req` that deliberately violates that contract.
 */
const MISSING_SERVER_REQ = { params: { workspaceId: WS }, query: {}, body: {}, headers: {}, socket: { remoteAddress: '127.0.0.1' }, ip: '127.0.0.1', protocol: 'http', get: (name: string) => (name.toLowerCase() === 'host' ? 'admin.test' : undefined) };

for (const { name, register, method, path, expected } of [
  { name: 'MCP delete: `req.params.serverId ?? ""`', register: registerAdminExternalMcpDeleteRoute, method: 'DELETE', path: `${BASE}/mcp-servers/server`,
    expected: { statusCode: 404, jsonBody: { error: 'external MCP server was not found', code: 'NOT_FOUND' } } },
  { name: 'MCP put: `req.params.serverId ?? ""`', register: registerAdminExternalMcpPutRoute, method: 'PUT', path: `${BASE}/mcp-servers/server`,
    expected: { statusCode: 400, jsonBody: {
      error: "mcp-federation: connectionId '' must match /^[a-z0-9][a-z0-9-]{0,39}$/ — it becomes part of every federated tool id, and a '_' in it would blur the 'mcp__<connection>__<tool>' separator",
      code: 'INVALID_MCP_SERVER', details: { field: 'id' },
    } } },
  { name: 'MCP probe: `req.params.serverId ?? ""`', register: (app: Parameters<RouteFailureCase['register']>[0], deps: Parameters<RouteFailureCase['register']>[1]) => registerAdminExternalMcpProbeRoute(app, deps, limiter), method: 'POST', path: `${BASE}/mcp-servers/server/probe`,
    expected: { statusCode: 400, jsonBody: { error: "no external MCP server is configured as ''", code: 'INVALID_MCP_SERVER', details: { field: 'id' } } } },
] as const) {
  test(`${name} fallback, forced via a direct handler call, resolves the empty id to a refusal, never a write or probe`, async () => {
    const { app } = fixture(register);
    assert.deepEqual(await invokeRouteDirectly({ app, method, path, req: MISSING_SERVER_REQ }), expected);
  });
}

test('MCP approvals revoke: `req.params.serverId ?? ""` / `req.params.toolName ?? ""` fallbacks, forced via a direct handler call, delete nothing and answer 404', async () => {
  const deletes: unknown[] = [];
  const { app } = fixture(registerAdminExternalMcpToolApprovalsRoutes, {
    externalMcpToolApprovalRepo: { listByWorkspaceId: async () => [], delete: async (input: unknown) => { deletes.push(input); return false; } },
  });
  assert.deepEqual(await invokeRouteDirectly({ app, method: 'DELETE', path: `${BASE}/mcp-servers/server/tool-approvals/tool`, req: MISSING_SERVER_REQ }), {
    statusCode: 404, jsonBody: { error: 'no Always allow is saved for that tool', code: 'NOT_FOUND' },
  });
  assert.deepEqual(deletes, [{ workspaceId: WS, serverId: '', toolName: '' }]);
});

for (const [name, register, method, suffix, expected] of [
  ['connect', registerAdminExternalMcpOAuthConnectRoute, 'POST', '/connect', { auth: { started: true } }],
  ['poll', registerAdminExternalMcpOAuthDevicePollRoute, 'POST', '/device/poll', { polled: true }],
  ['disconnect', registerAdminExternalMcpOAuthDisconnectRoute, 'DELETE', '', { disconnected: true, restartRequired: true }],
] as const) {
  test(`MCP OAuth ${name}: \`req.params.serverId ?? ""\` fallback, forced via a direct handler call, hands the service the empty id`, async () => {
    const serverIds: string[] = [];
    const service = {
      beginConnect: async ({ serverId }: { serverId: string }) => { serverIds.push(serverId); return { started: true }; },
      pollDeviceAuthorization: async ({ serverId }: { serverId: string }) => { serverIds.push(serverId); return { polled: true }; },
      disconnect: async ({ serverId }: { serverId: string }) => { serverIds.push(serverId); },
    };
    const { app } = fixture((app, deps) => register(app, { ...deps, externalMcpOAuth: service } as unknown as Parameters<typeof register>[1], limiter));
    assert.deepEqual(await invokeRouteDirectly({ app, method, path: `${BASE}/mcp-servers/server/oauth${suffix}`, req: MISSING_SERVER_REQ }), {
      statusCode: 200, jsonBody: expected,
    });
    assert.deepEqual(serverIds, ['']);
  });
}
