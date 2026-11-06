import '../../../apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { ElectronApplication } from '@playwright/test';
import { createInMemoryEventLog, createRunLifecycle } from '@jini-ai/daemon';
import { registerRunRoutes } from '@jini-ai/daemon/http';
import { createApp, createRouteDeps } from '../../../apps/website/src/server/runtime/composition/app.js';
import { bootAuthenticated, startTestServer } from '../../../apps/website/src/server/__tests__/helpers/http-test-server.js';
import { ensureAgentDaemonToken, ensureToolExecToken, requireAgentDaemonToken } from '../../../apps/website/src/assistant/daemon-access.js';
import { createRunActiveContextStore, registerRunActiveContextRoute } from '../../../apps/website/src/assistant/run-active-context.js';
import { registerDurableRunStartRoute } from '../../../apps/website/src/server/inbound/assistant/durable-run-routes.js';
import { createDaemonSiteTools } from '../../../apps/website/src/server/inbound/assistant/agent-daemon-site-tools.js';
import { assistantRunFinalizerFor } from '../../../apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.js';
import { onTeardown } from '../../../apps/website/src/__tests__/fixtures/teardown.js';
import { acceptRuns } from '../../e2e/desktop/_assistant-release-gate.js';

test('the release journey creates an admitted site attempt before catalog discovery', async t => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const daemon = express();
  ensureAgentDaemonToken({}, {});
  daemon.use(requireAgentDaemonToken({}, {}), express.json());
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  registerDurableRunStartRoute({ app: daemon, lifecycle, onStarted: () => {}, store: deps.chatRunLedger.durable! });
  const resolvedPortRef = { current: 0 };
  registerRunRoutes({ app: daemon, deps: { lifecycle }, adapter: { resolvedPortRef, env: {} } });
  registerRunActiveContextRoute(daemon, createRunActiveContextStore());
  const daemonUrl = await startTestServer(daemon, t);
  resolvedPortRef.current = Number(new URL(daemonUrl).port);
  const previousUrl = process.env.JINI_AGENT_DAEMON_URL;
  process.env.JINI_AGENT_DAEMON_URL = daemonUrl;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.JINI_AGENT_DAEMON_URL;
    else process.env.JINI_AGENT_DAEMON_URL = previousUrl;
  });
  // The test already owns a listening daemon; this is readiness, not request admission.
  const routeDeps = Object.assign(deps, { assistantDaemonDemand: { ensureReady: async () => {}, isReady: () => true } });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(routeDeps), t);
  const state = globalThis as typeof globalThis & { __assistantGateSites?: unknown[] };
  const previousSites = state.__assistantGateSites;
  state.__assistantGateSites = [{ origin: baseUrl, session: { fetch: (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('cookie', cookie);
    return fetch(url, { ...init, headers });
  } } }];
  t.after(() => {
    if (previousSites === undefined) delete state.__assistantGateSites;
    else state.__assistantGateSites = previousSites;
  });
  // Only the Electron IPC boundary is replaced. The actual journey callback, HTTP session,
  // site routes, daemon routes, durable store and catalog admission all execute unchanged.
  const app = { evaluate: async (fn: () => unknown) => fn() } as unknown as ElectronApplication;
  const [accepted] = await acceptRuns({ app, count: 1 });
  assert.ok(accepted?.runId);
  onTeardown({ t, step: async () => {
    await lifecycle.finish({ runId: accepted.runId!, status: 'cancelled', code: null, signal: null, resumable: false });
    await assistantRunFinalizerFor({ ledger: deps.chatRunLedger, tracker: deps.tracker, observability: deps.observability }).idle();
  } });
  const principalId = await deps.ownerPrincipalId;
  const catalog = (runId: string, caller: string, token = ensureToolExecToken({}, {})) => fetch(`${baseUrl}/internal/tool-catalog?${new URLSearchParams({ runId, principalId: caller })}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const admitted = await catalog(accepted.runId, principalId);
  const text = await admitted.text();
  assert.equal(admitted.status, 200, text);
  assert.ok(Array.isArray(JSON.parse(text).tools));
  assert.ok(await deps.chatRunLedger.durable!.find({ runId: accepted.runId, principalId }, {}));
  const siteTools = createDaemonSiteTools({ baseUrl, token: ensureToolExecToken({}, {}), localRegistry: { list: () => [] }, contextFor: () => ({}) });
  await siteTools.start({ runId: accepted.runId, principalId });
  t.after(() => siteTools.finish({ runId: accepted.runId! }));
  assert.ok(siteTools.withRun({ runId: accepted.runId, fn: () => siteTools.registry.list({}).length }) > 0);
  for (const [runId, caller, token, status] of [
    [accepted.runId, principalId, 'wrong', 401],
    ['unaccepted', principalId, ensureToolExecToken({}, {}), 403],
    [accepted.runId, 'another-principal', ensureToolExecToken({}, {}), 403],
  ] as const) {
    const refused = await catalog(runId, caller, token);
    assert.equal(refused.status, status);
    await refused.body?.cancel();
  }
  await deps.chatRunLedger.durable!.cancel({ runId: accepted.runId, reason: 'user-stop' }, {});
  const cancelled = await catalog(accepted.runId, principalId);
  assert.equal(cancelled.status, 403);
  await cancelled.body?.cancel();
});
