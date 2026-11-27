import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { AGENT_DAEMON_TOKEN_ENV_VAR, requireAgentDaemonToken, createRunScopedCredentials } from '#src/assistant/daemon-access';
import { registerToolAccessLoweringRoute, TOOL_ACCESS_LOWERING_PATH } from '../tool-access-lowering-route.js';
import { NO_INCIDENT_REPORTER } from '#src/server/__tests__/helpers/composed-reporter-probe';

test('lowering control rejects unauthenticated requests and caller-selected identities', async t => {
  const app = express(); let calls = 0;
  app.use(requireAgentDaemonToken({ env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: 'control-key' } }, {})); app.use(express.json());
  registerToolAccessLoweringRoute({ app, reporter: NO_INCIDENT_REPORTER, lower: async () => { calls++; return { stoppedRunIds: [], failedRunIds: [] }; } });
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
  registerToolAccessLoweringRoute({ app, reporter: NO_INCIDENT_REPORTER, lower: async () => ({ stoppedRunIds: ['one'], failedRunIds: ['two'] }) });
  const base = await startTestServer(app, t);
  const response = await fetch(base + TOOL_ACCESS_LOWERING_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverIds: ['mail'] }) });
  assert.equal(response.status, 503); assert.equal((await response.json() as { ok: boolean }).ok, false);
});


test('successful lowering control responds only after cleanup and rejects oversized selectors', async t => {
  const app = express(); app.use(express.json());
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  registerToolAccessLoweringRoute({ app, reporter: NO_INCIDENT_REPORTER, lower: async () => { entered(); await held; return { stoppedRunIds: ['one'], failedRunIds: [] }; } });
  const base = await startTestServer(app, t);
  const headers = { 'content-type': 'application/json' };
  assert.equal((await fetch(base + TOOL_ACCESS_LOWERING_PATH, { method: 'POST', headers, body: JSON.stringify({ serverIds: Array(32).fill('a'.repeat(128)) }) })).status, 400);
  let responded = false;
  const response = fetch(base + TOOL_ACCESS_LOWERING_PATH, { method: 'POST', headers, body: JSON.stringify({ serverIds: ['mail'] }) }).then(value => { responded = true; return value; });
  await started; assert.equal(responded, false); release();
  assert.equal((await response).status, 200);
});

test('the lowering route accepts exactly 1 KiB but does not dispatch a one-byte-larger control', async t => {
  const app = express();
  app.use(express.json());
  const lowered: unknown[] = [];
  registerToolAccessLoweringRoute({ app, reporter: NO_INCIDENT_REPORTER, lower: async input => {
    lowered.push(input);
    return { stoppedRunIds: ['answer-23'], failedRunIds: [] };
  } });
  const base = await startTestServer(app, t);
  const leadingIds = Array.from({ length: 7 }, (_, index) => String(index).repeat(128));
  const tailLength = 1024 - Buffer.byteLength(JSON.stringify({ serverIds: [...leadingIds, ''] }));
  const input = { serverIds: [...leadingIds, 'z'.repeat(tailLength)] };
  const send = async (lastLength: number) => {
    const body = JSON.stringify({ serverIds: [...leadingIds, 'z'.repeat(lastLength)] });
    const response = await fetch(base + TOOL_ACCESS_LOWERING_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    return { bytes: Buffer.byteLength(body), status: response.status, body: await response.json() };
  };
  assert.deepEqual(await send(tailLength + 1), { bytes: 1025, status: 400, body: {
    error: 'Tool access changes require agent, server, or plugin IDs in a control payload at most 1 KiB.',
  } });
  assert.deepEqual(lowered, []);
  assert.deepEqual(await send(tailLength), { bytes: 1024, status: 200, body: {
    ok: true, stoppedRunIds: ['answer-23'], failedRunIds: [],
  } });
  assert.deepEqual(lowered, [input]);
});
