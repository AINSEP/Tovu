import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeStartupSecrets, startupSecretEnvironment, STARTUP_SECRET_KEYS } from '../startup-secrets.js';
import { ensureAgentDaemonToken, requireAgentDaemonToken } from '#src/assistant/daemon-access';
import express from 'express';
import { desktopRenderForHost } from '../../../../platform/headless-browser/desktop-render.js';
import { startRenderBridge } from '@jini-ai/desktop-host/render-bridge';
import { desktopMcpRuntime } from '#src/assistant/desktop-mcp-runtime';
import { resolveOwnerCredentials } from '#src/features/identity/wiring';
import { spawn } from 'node:child_process';
import { provideNodeStartupSecrets, STARTUP_SECRETS_ENV } from '@jini-ai/sidecar/supervisor/node';

test('the site authenticates with its startup daemon token without exporting secrets to descendants', async () => {
  const prior = Object.fromEntries(STARTUP_SECRET_KEYS.map(key => [key, process.env[key]]));
  const priorRenderUrl = process.env.JINI_DESKTOP_RENDER_URL;
  const privateLaunch = { TOVU_ADMIN_PASSWORD: 'owner-launch-fixture', TOVU_DESKTOP_MCP_TOKEN: 'b'.repeat(64),
    TOVU_DESKTOP_MCP_HANDOFF_TOKEN: 'c'.repeat(64) };
  const priorPrivate = Object.fromEntries(Object.keys(privateLaunch).map(key => [key, process.env[key]]));
  const priorDesktopUrl = process.env.TOVU_DESKTOP_MCP_URL;
  const png = Buffer.from('captured-png');
  const bridge = await startRenderBridge({ capture: { async captureUrl() {
    return { png, finalUrl: 'http://127.0.0.1/', title: 'Private capture', status: 200,
      pageHeight: 1, capturedHeight: 1, blockedRequests: 0 };
  } } });
  process.env.TOVU_AGENT_DAEMON_TOKEN = 'startup-daemon-secret';
  process.env.TOVU_TOOL_EXEC_TOKEN = 'startup-tool-secret';
  Object.assign(process.env, bridge.env);
  Object.assign(process.env, privateLaunch, { TOVU_DESKTOP_MCP_URL: 'http://127.0.0.1:4568/mcp' });
  try {
    await initializeStartupSecrets({}, {});
    for (const key of STARTUP_SECRET_KEYS) assert.equal(key in process.env, false, `${key} must be consumed`);
    for (const key of Object.keys(privateLaunch)) assert.equal(key in process.env, false, `${key} must be consumed`);
    assert.equal(ensureAgentDaemonToken({}, {}), 'startup-daemon-secret');
    assert.equal(resolveOwnerCredentials({ env: startupSecretEnvironment({ env: process.env }) }).password, privateLaunch.TOVU_ADMIN_PASSWORD);
    assert.equal(desktopMcpRuntime.owned, true);
    assert.equal(desktopMcpRuntime.handoffToken, privateLaunch.TOVU_DESKTOP_MCP_HANDOFF_TOKEN);
    assert.equal(await desktopMcpRuntime.bearerToken({ url: 'http://127.0.0.1:4568/mcp' }), privateLaunch.TOVU_DESKTOP_MCP_TOKEN);
    assert.equal(await desktopMcpRuntime.bearerToken({ url: 'http://127.0.0.1:4569/mcp' }), undefined);
    const capture = desktopRenderForHost({ env: process.env });
    assert.ok(capture);
    const result = await capture.captureUrl({ url: 'http://127.0.0.1/', viewport: { width: 800, height: 600 }, fullPage: false,
      maxPageHeightPx: 4000, settleMs: 0 });
    assert.deepEqual(Buffer.from(result.png), png, 'the private token still authenticates native capture');
    assert.equal(startupSecretEnvironment({ env: {} }).TOVU_AGENT_DAEMON_TOKEN, undefined, 'an explicit scope never receives ambient authority');
    const app = express();
    app.use(requireAgentDaemonToken({}, {}));
    app.get('/private', (_req, res) => { res.sendStatus(200); });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const url = `http://127.0.0.1:${address.port}/private`;
      assert.equal((await fetch(url, { headers: { authorization: 'Bearer startup-daemon-secret' } })).status, 200);
      assert.equal((await fetch(url)).status, 401);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  } finally {
    bridge.close();
    if (priorRenderUrl === undefined) delete process.env.JINI_DESKTOP_RENDER_URL; else process.env.JINI_DESKTOP_RENDER_URL = priorRenderUrl;
    if (priorDesktopUrl === undefined) delete process.env.TOVU_DESKTOP_MCP_URL; else process.env.TOVU_DESKTOP_MCP_URL = priorDesktopUrl;
    for (const [key, value] of Object.entries({ ...prior, ...priorPrivate })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('startup delivery preserves the process runtime and configured owner after imports', { timeout: 30_000 }, async t => {
  const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    await import('#src/platform/site-dir/__tests__/helpers/isolated-catalog-home');
    const { desktopMcpRuntime } = await import(${JSON.stringify(moduleUrl('../../../../assistant/desktop-mcp-runtime.ts'))});
    const bearer = desktopMcpRuntime.bearerToken;
    const { initializeStartupSecrets } = await import(${JSON.stringify(moduleUrl('../startup-secrets.ts'))});
    await initializeStartupSecrets();
    for (const name of ['TOVU_ADMIN_PASSWORD', 'TOVU_DESKTOP_MCP_TOKEN', 'TOVU_DESKTOP_MCP_HANDOFF_TOKEN']) assert.equal(name in process.env, false);
    assert.equal(desktopMcpRuntime.owned, true);
    assert.equal(desktopMcpRuntime.handoffToken, 'c'.repeat(64));
    assert.equal(await bearer({ url: 'http://127.0.0.1:4568/mcp' }), 'b'.repeat(64));
    const { createRouteDeps } = await import('#src/server/runtime/composition/app');
    const deps = createRouteDeps();
    await deps.identityReady;
    const owner = await deps.userRepo.findByPrincipalId({ workspaceId: deps.workspaceId, principalId: await deps.ownerPrincipalId });
    assert.ok(owner);
    assert.equal(await deps.passwordHasher.verify({ password: 'owner-ipc-fixture', hash: owner.passwordHash }), true);
    assert.equal(await deps.passwordHasher.verify({ password: 'tovu-dev', hash: owner.passwordHash }), false);
    const { runProductionReadinessGateOrExit } = await import(${JSON.stringify(moduleUrl('../boot-readiness-gate.ts'))});
    await runProductionReadinessGateOrExit();
    console.log('startup-consumers-ready');
    process.disconnect();
  `;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: process.cwd(), env: { ...process.env, [STARTUP_SECRETS_ENV]: '1',
      TOVU_RUNTIME_MODE: 'production', TOVU_DESKTOP_MCP_URL: 'http://127.0.0.1:4568/mcp',
      ANALYTICS_ROOT_KEY_SEED: 'readiness-fixture', TOVU_SITE_KEY: '7a'.repeat(32) },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const delivery = provideNodeStartupSecrets({ peer: child, secrets: {
    TOVU_ADMIN_PASSWORD: 'owner-ipc-fixture', TOVU_DESKTOP_MCP_TOKEN: 'b'.repeat(64), TOVU_DESKTOP_MCP_HANDOFF_TOKEN: 'c'.repeat(64),
  } });
  let stdout = ''; let stderr = '';
  child.stdout!.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr!.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const status = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  delivery.dispose({});
  assert.equal(status, 0, stderr);
  assert.match(stdout, /startup-consumers-ready/);
  assert.doesNotMatch(stderr, /default-owner-password/);
});
