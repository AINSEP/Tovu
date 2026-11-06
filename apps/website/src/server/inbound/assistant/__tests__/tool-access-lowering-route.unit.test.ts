import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { AGENT_DAEMON_TOKEN_ENV_VAR, requireAgentDaemonToken, createRunScopedCredentials } from '#src/assistant/daemon-access';
import { registerToolAccessLoweringRoute, TOOL_ACCESS_LOWERING_PATH } from '../tool-access-lowering-route.js';

test('lowering control rejects unauthenticated requests and caller-selected identities', async t => {
  const app = express(); let calls = 0;
  app.use(requireAgentDaemonToken({ env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: 'control-key' } }, {})); app.use(express.json());
  registerToolAccessLoweringRoute({ app, lower: async () => { calls++; return { stoppedRunIds: [], failedRunIds: [] }; } });
  const base = await startTestServer(app, t);
  assert.equal((await fetch(base + TOOL_ACCESS_LOWERING_PATH, { method: 'POST' })).status, 401);
  const scoped = createRunScopedCredentials({ principalOfLiveRun: () => 'owner' });
  const token = scoped.mint({ runId: 'run' });
  assert.equal((await fetch(base + TOOL_ACCESS_LOWERING_PATH, { method: 'POST', headers: { authorization: `Bearer ${token}` } })).status, 401);
  const response = await fetch(base + TOOL_ACCESS_LOWERING_PATH, { method: 'POST', headers: { authorization: 'Bearer control-key', 'content-type': 'application/json' }, body: JSON.stringify({ agentIds: ['claude'], siteId: 'foreign' }) });
  assert.equal(response.status, 400); assert.equal(calls, 0);
});

test('cleanup failure returns 503 and successful control waits for cleanup', async t => {
  const app = express(); app.use(express.json());
  registerToolAccessLoweringRoute({ app, lower: async () => ({ stoppedRunIds: ['one'], failedRunIds: ['two'] }) });
  const base = await startTestServer(app, t);
  const response = await fetch(base + TOOL_ACCESS_LOWERING_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverIds: ['mail'] }) });
  assert.equal(response.status, 503); assert.equal((await response.json() as { ok: boolean }).ok, false);
});


test('successful lowering control responds only after cleanup and rejects oversized selectors', async t => {
  const app = express(); app.use(express.json());
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  registerToolAccessLoweringRoute({ app, lower: async () => { entered(); await held; return { stoppedRunIds: ['one'], failedRunIds: [] }; } });
  const base = await startTestServer(app, t);
  const headers = { 'content-type': 'application/json' };
  assert.equal((await fetch(base + TOOL_ACCESS_LOWERING_PATH, { method: 'POST', headers, body: JSON.stringify({ serverIds: Array(32).fill('a'.repeat(128)) }) })).status, 400);
  let responded = false;
  const response = fetch(base + TOOL_ACCESS_LOWERING_PATH, { method: 'POST', headers, body: JSON.stringify({ serverIds: ['mail'] }) }).then(value => { responded = true; return value; });
  await started; assert.equal(responded, false); release();
  assert.equal((await response).status, 200);
});
