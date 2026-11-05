import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENT_DEFS } from '@jini-ai/agent-runtime';
import { InMemorySettingsRepo, ensureSettingDefinitions, getEffective } from '@jini-ai/core/settings';
import type { JsonValue } from '@jini-ai/core/primitives';
import { ensureExecutionSettingDefinitions } from '#src/assistant/execution-mode-settings';
import { assistantCliPermissions } from '#src/assistant/assistant-subagents-policy';
import { readCliPermissionLayer } from '#src/assistant/cli-permission-layer';
import { ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_CLI_PERMISSIONS_KEY } from '#src/contracts/headless/index';
import { set } from '#src/features/settings/index';
import { toWriteServiceDeps } from '#src/server/inbound/admin-http/routes/settings/shared';
import { allowAssistantRunTools, readAssistantToolConsentSnapshot } from '../assistant-tool-access.js';

type Input = Parameters<typeof allowAssistantRunTools>[0];
const DEFAULT_PERMISSIONS = { enabled: true, capabilities: { ...assistantCliPermissions({ enabled: true }).capabilities } };

async function fixture() {
  let id = 0; let permit = true;
  let afterAuthorize: (() => void | Promise<void>) | undefined;
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowMs: () => 1_791_504_000_000, nowIso: () => '2026-10-09T00:00:00.000Z' };
  const idGen = { newId: () => `consent-${++id}` };
  await ensureExecutionSettingDefinitions({ settingsRepo, clock, ids: idGen,
    principals: { findActiveById: async () => null }, ensureSettingDefinitions }, { systemPrincipalId: 'system' });
  const deps = { workspaceId: 'site-one', settingsReady: Promise.resolve(), settingsUiTabsReady: Promise.resolve(),
    settingsRepo, clock, idGen, getEffective, ownerPrincipalId: Promise.resolve('owner'),
    principalRepo: { findById: async () => null }, authorize: async () => { await afterAuthorize?.(); return { allowed: permit, reason: 'fixture' }; },
  } as unknown as Input['deps'];
  const base = { deps, env: {}, principalId: 'owner', agentId: 'antigravity',
    getDef: ({ id: requested }: { id: string }) => AGENT_DEFS.find(def => def.id === requested) ?? null };
  async function seed(value: Record<string, JsonValue>) {
    return set({ deps: toWriteServiceDeps(deps), input: { namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: ASSISTANT_CLI_PERMISSIONS_KEY,
      scope: 'user', workspaceId: deps.workspaceId, authWorkspaceId: deps.workspaceId, principalId: 'owner', callerPrincipalId: 'owner', value } });
  }
  return { base, seed, deny: () => { permit = false; }, afterAuthorize: (fn: () => void | Promise<void>) => { afterAuthorize = fn; },
    layer: () => readCliPermissionLayer({ ...deps, principalId: 'owner' }) };
}

test('Allow patches only selected keys while preserving raw fields, site defaults and sibling entries', async () => {
  const f = await fixture();
  const raw = { ...assistantCliPermissions({ enabled: true }), futureSiteField: 'preserve', byAgent: {
    claude: { capabilities: { shell: false }, futureAgentField: 'keep' },
    antigravity: { capabilities: { web: false }, futureAgentField: 'keep-selected' },
  } };
  const initial = await f.seed(raw);
  const result = await allowAssistantRunTools({ ...f.base, keys: ['userMcp'], expectedRevisionSeq: initial.revisionSeq, isLive: () => true });
  assert.equal(result, true);
  assert.deepEqual((await f.layer()).raw, { ...raw, byAgent: { ...raw.byAgent,
    antigravity: { ...raw.byAgent.antigravity, capabilities: { web: false, userMcp: true } } } });
});

for (const scenario of [
  { name: 'non-owner', principalId: 'other-admin', env: {} },
  { name: 'hosted', principalId: 'owner', env: { TOVU_HOSTED: '1' } },
  { name: 'environment lock', principalId: 'owner', env: { TOVU_AGENT_FULL_CLI_ACCESS: 'false' } },
]) test(`${scenario.name} cannot grant tools even with a live run`, async () => {
  const f = await fixture();
  const before = await f.layer();
  const input = { ...f.base, ...scenario };
  assert.equal((await readAssistantToolConsentSnapshot(input)).allowed, false);
  assert.equal(await allowAssistantRunTools({ ...input, keys: ['userMcp'], expectedRevisionSeq: before.revisionSeq, isLive: () => true }), false);
  assert.deepEqual(await f.layer(), before);
});

test('a cancelled run and a stale card revision leave permissions untouched', async () => {
  const f = await fixture();
  const first = await f.seed({ ...DEFAULT_PERMISSIONS });
  const second = await f.seed({ ...DEFAULT_PERMISSIONS, futureSiteField: 'newer' });
  assert.equal(await allowAssistantRunTools({ ...f.base, keys: ['userMcp'], expectedRevisionSeq: first.revisionSeq, isLive: () => true }), false);
  assert.equal(await allowAssistantRunTools({ ...f.base, keys: ['userMcp'], expectedRevisionSeq: second.revisionSeq, isLive: () => false }), false);
  assert.equal((await f.layer()).revisionSeq, second.revisionSeq);
});

test('terminal completion during authorization cannot commit a previously approved card', async () => {
  const f = await fixture(); let live = true;
  f.afterAuthorize(() => { live = false; });
  assert.equal(await allowAssistantRunTools({ ...f.base, keys: ['userMcp'], expectedRevisionSeq: 0, isLive: () => live }), false);
  assert.equal((await f.layer()).revisionSeq, 0);
});

test('owner identity alone does not bypass the existing settings authorization', async () => {
  const f = await fixture(); f.deny();
  await assert.rejects(allowAssistantRunTools({ ...f.base, keys: ['userMcp'], expectedRevisionSeq: 0, isLive: () => true }), /permission to change settings/);
  assert.equal((await f.layer()).revisionSeq, 0);
});

test('an unknown consent key is rejected without widening or writing any grant', async () => {
  const f = await fixture();
  await assert.rejects(allowAssistantRunTools({ ...f.base, keys: ['unrecognized'], expectedRevisionSeq: 0, isLive: () => true }), /tool request changed/);
  assert.equal((await f.layer()).revisionSeq, 0);
});


test('terminal completion in the settings writer authorization cannot enable a dead run', async () => {
  const f = await fixture(); let live = true; let authorizations = 0;
  f.afterAuthorize(() => { if (++authorizations === 2) live = false; });
  assert.equal(await allowAssistantRunTools({ ...f.base, keys: ['userMcp'], expectedRevisionSeq: 0, isLive: () => live }), false);
  assert.equal((await f.layer()).revisionSeq, 0);
});

test('the real addressed-layer CAS returns stale instead of overwriting a concurrent edit', async () => {
  const f = await fixture(); let authorizations = 0;
  f.afterAuthorize(async () => {
    if (++authorizations === 2) await f.seed({ ...DEFAULT_PERMISSIONS, concurrentField: 'keep-newer' });
  });
  assert.equal(await allowAssistantRunTools({ ...f.base, keys: ['userMcp'], expectedRevisionSeq: 0, isLive: () => true }), false);
  assert.equal((await f.layer()).raw.concurrentField, 'keep-newer');
  assert.equal((await f.layer()).raw.byAgent, undefined);
});
