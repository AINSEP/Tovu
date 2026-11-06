import assert from 'node:assert/strict';
import test from 'node:test';
import { daemonCoreRequest } from '#src/assistant/daemon-core-protocol';
import { createDaemonCoreClient } from '../agent-daemon-core-client.js';

const allowInput = { runId: 'accepted-run', agentId: 'antigravity', keys: ['userMcp'], expectedRevisionSeq: 4 };
const snapshot = { permissions: { enabled: true, capabilities: { userMcp: false } }, revisionSeq: 4, allowed: true };

test('consent RPC accepts only a run-bound target and explicit bounded capability keys', () => {
  assert.equal(daemonCoreRequest.safeParse({ operation: 'cliConsentSnapshot', input: { runId: 'accepted-run', agentId: 'antigravity' } }).success, true);
  assert.equal(daemonCoreRequest.safeParse({ operation: 'cliConsentAllow', input: allowInput }).success, true);
  for (const field of ['principalId', 'workspaceId', 'site', 'permissions']) {
    assert.equal(daemonCoreRequest.safeParse({ operation: 'cliConsentAllow', input: { ...allowInput, [field]: 'caller-controlled' } }).success, false);
  }
  for (const keys of [['unknown'], [], Array(20).fill('shell')]) {
    assert.equal(daemonCoreRequest.safeParse({ operation: 'cliConsentAllow', input: { ...allowInput, keys } }).success, false);
  }
});

test('daemon consent client uses the existing authenticated RPC without local writes or caller identities', async () => {
  const sent: unknown[] = [];
  const client = createDaemonCoreClient({ baseUrl: 'http://127.0.0.1:1234', token: 'fixture-private-rpc' }, { fetch: async (_url, init) => {
    const body = JSON.parse(String(init?.body)); sent.push(body);
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer fixture-private-rpc');
    return new Response(JSON.stringify({ value: body.operation === 'cliConsentSnapshot' ? snapshot : true }), { status: 200 });
  } });
  assert.deepEqual(await client.readToolConsentSnapshot({ runId: 'accepted-run', agentId: 'antigravity' }), snapshot);
  assert.equal(await client.allowRunTools(allowInput), true);
  assert.deepEqual(sent, [{ operation: 'cliConsentSnapshot', input: { runId: 'accepted-run', agentId: 'antigravity' } }, { operation: 'cliConsentAllow', input: allowInput }]);
});
