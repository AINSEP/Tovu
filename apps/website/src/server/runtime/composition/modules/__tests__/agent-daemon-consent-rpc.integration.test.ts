import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { ensureSettingDefinitions, getEffective, InMemorySettingsRepo } from '@jini-ai/core/settings';
import { ensureExecutionSettingDefinitions } from '#src/assistant/execution-mode-settings';
import { readCliPermissionLayer } from '#src/assistant/cli-permission-layer';
import { ensureToolExecToken } from '#src/assistant/daemon-access';
import { createDaemonCoreClient } from '#src/server/inbound/assistant/agent-daemon-core-client';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { registerAgentDaemonCoreRoutes } from '../agent-daemon-core-rpc.js';

type Deps = Parameters<typeof registerAgentDaemonCoreRoutes>[0]['deps'];

async function fixture(t: import('node:test').TestContext) {
  let id = 0;
  let actor = { kind: 'user', status: 'active' };
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowMs: () => 1_791_504_000_000, nowIso: () => '2026-10-09T00:00:00.000Z' };
  const idGen = { newId: () => `rpc-consent-${++id}` };
  await ensureExecutionSettingDefinitions({ settingsRepo, clock, ids: idGen,
    principals: { findActiveById: async () => null }, ensureSettingDefinitions }, { systemPrincipalId: 'system' });
  const run = { runId: 'accepted-run', workspaceId: 'site-one', principalId: 'owner' as string | null,
    cancelReason: null as string | null, message: { runStatus: 'queued' }, request: { agentId: 'antigravity', contextRef: '{}' } };
  const deps = { workspaceId: 'site-one', settingsRepo, getEffective, ownerPrincipalId: Promise.resolve('owner'),
    settingsReady: Promise.resolve(), settingsUiTabsReady: Promise.resolve(), siteTitleReady: Promise.resolve(), clock, idGen,
    authorize: async () => ({ allowed: true, reason: 'fixture' }), principalRepo: { findById: async ({ id, workspaceId }: { id: string; workspaceId: string }) => ({ id, workspaceId, ...actor }) },
    chatRunLedger: { durable: { find: async ({ runId }: { runId: string }) => runId === run.runId ? run : null } },
  } as unknown as Deps;
  const token = ensureToolExecToken({}, {});
  const app = express(); registerAgentDaemonCoreRoutes({ router: app, deps });
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(409).json({ error: error.name }); });
  const baseUrl = await startTestServer(app, t);
  const client = createDaemonCoreClient({ baseUrl, token });
  const target = { runId: run.runId, agentId: 'antigravity' };
  const layer = () => readCliPermissionLayer({ settingsRepo, workspaceId: deps.workspaceId, principalId: 'owner' });
  return { run, client, target, layer, baseUrl, token, settingsRepo, setActor: (value: typeof actor) => { actor = value; } };
}

test('memory daemon consent reads and writes only the authenticated site owner ledger', async t => {
  const f = await fixture(t);
  const snapshot = await f.client.readToolConsentSnapshot(f.target);
  assert.equal(snapshot.allowed, true); assert.equal(snapshot.permissions.capabilities.userMcp, false); assert.equal(snapshot.revisionSeq, 0);
  assert.equal(await f.client.allowRunTools({ ...f.target, keys: ['userMcp'], expectedRevisionSeq: snapshot.revisionSeq }), true);
  const layer = await f.layer();
  assert.equal((layer.raw.byAgent as { antigravity: { capabilities: { userMcp: boolean } } }).antigravity.capabilities.userMcp, true);
  assert.equal(await f.client.allowRunTools({ ...f.target, keys: ['shell'], expectedRevisionSeq: 0 }), false, 'stale revision cannot overwrite owner choices');
});

test('accepted non-owner attempts cannot gain tool access through the private daemon channel', async t => {
  const f = await fixture(t); f.run.principalId = 'other-admin';
  const snapshot = await f.client.readToolConsentSnapshot(f.target);
  assert.equal(snapshot.allowed, false); assert.equal(snapshot.reason, 'not_owner');
  assert.equal(await f.client.allowRunTools({ ...f.target, keys: ['userMcp'], expectedRevisionSeq: 0 }), false);
  assert.equal((await f.layer()).revisionSeq, 0);
});

test('cancellation after the settings append rolls the private RPC grant back before commit', async t => {
  const f = await fixture(t);
  const append = f.settingsRepo.appendRevision.bind(f.settingsRepo);
  f.settingsRepo.appendRevision = async record => {
    const seq = await append(record);
    f.run.cancelReason = 'user_cancelled';
    return seq;
  };
  assert.equal(await f.client.allowRunTools({ ...f.target, keys: ['userMcp'], expectedRevisionSeq: 0 }), false);
  assert.equal((await f.layer()).revisionSeq, 0);
  assert.equal((await f.layer()).raw.byAgent, undefined);
});

test('foreign, terminal, cancelled and unknown accepted attempts cannot approve any grant', async t => {
  const f = await fixture(t);
  for (const invalid of [
    () => { f.run.workspaceId = 'foreign-site'; },
    () => { f.run.workspaceId = 'site-one'; f.run.message.runStatus = 'succeeded'; },
    () => { f.run.message.runStatus = 'running'; f.run.cancelReason = 'user_cancelled'; },
    () => { f.run.cancelReason = null; f.run.principalId = null; },
  ]) {
    invalid();
    await assert.rejects(f.client.readToolConsentSnapshot(f.target), /RPC refused/);
    await assert.rejects(f.client.allowRunTools({ ...f.target, keys: ['userMcp'], expectedRevisionSeq: 0 }), /RPC refused/);
  }
  await assert.rejects(f.client.readToolConsentSnapshot({ ...f.target, runId: 'unknown-run' }), /RPC refused/);
  assert.equal((await f.layer()).revisionSeq, 0);
});

test('consent RPC authenticates before JSON and rejects caller-supplied identities and site targets', async t => {
  const f = await fixture(t);
  const endpoint = `${f.baseUrl}/internal/agent-daemon-core`;
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status, 401);
  for (const key of ['principalId', 'workspaceId', 'site']) {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${f.token}` },
      body: JSON.stringify({ operation: 'cliConsentAllow', input: { ...f.target, keys: ['userMcp'], expectedRevisionSeq: 0, [key]: 'other' } }) });
    assert.equal(response.status, 400);
  }
  assert.equal((await f.layer()).revisionSeq, 0);
});

for (const actor of [
  { kind: 'agent', status: 'active' },
  { kind: 'api_key', status: 'active' },
  { kind: 'system', status: 'active' },
  { kind: 'user', status: 'disabled' },
]) test(`tool consent refuses an ${actor.status} ${actor.kind} before snapshot or grant`, async t => {
  const f = await fixture(t); f.setActor(actor);
  await assert.rejects(f.client.readToolConsentSnapshot(f.target), /RPC refused/);
  await assert.rejects(f.client.allowRunTools({ ...f.target, keys: ['userMcp'], expectedRevisionSeq: 0 }), /RPC refused/);
  assert.equal((await f.layer()).revisionSeq, 0);
});

test('deactivation after the consent snapshot prevents the private RPC grant', async t => {
  const f = await fixture(t);
  assert.equal((await f.client.readToolConsentSnapshot(f.target)).allowed, true);
  f.setActor({ kind: 'user', status: 'disabled' });
  await assert.rejects(f.client.allowRunTools({ ...f.target, keys: ['userMcp'], expectedRevisionSeq: 0 }), /RPC refused/);
  assert.equal((await f.layer()).revisionSeq, 0);
});
