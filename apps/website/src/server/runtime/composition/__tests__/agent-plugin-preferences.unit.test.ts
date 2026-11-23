import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InMemorySettingsRepo, SettingsRevisionConflictError, clear, getEffective, set, type SettingDefinitionRecord } from '@jini-ai/core/settings';
import { ADMIN_INTERFACE_NAMESPACE, CHAT_AGENT_PLUGINS_KEY } from '#src/features/settings/admin-interface';
import { composeAgentPluginPreferences } from '../agent-plugin-service-ports.js';

function fixture() {
  const now = '2026-11-06T00:00:00.000Z';
  const definition: SettingDefinitionRecord = {
    settingId: 'plugin-mode', version: 1, workspaceId: null, namespace: ADMIN_INTERFACE_NAMESPACE,
    key: CHAT_AGENT_PLUGINS_KEY, ownerKind: 'core', ownerId: null,
    schema: { type: 'enum', values: ['auto', 'ask', 'off'] }, defaultValue: 'auto', scopes: 6,
    secret: false, status: 'active', aliasOfNamespace: null, aliasOfKey: null, coercionTag: null,
    createdAt: now, updatedAt: now,
  };
  const repo = new InMemorySettingsRepo({ definitions: [definition] });
  let id = 0;
  const settings = { repo, clock: { nowIso: () => now, nowMs: () => Date.parse(now) }, ids: { newId: () => `id-${++id}` },
    authorize: async () => ({ allowed: true, reason: 'test' }), principals: { findActiveById: async ({ id }: { id: string }) => ({ id }) } };
  const input = { workspaceId: 'site', principalId: 'alice' };
  const change = (value: string, scope: 'user' | 'workspace' = 'user') => set({ deps: settings, input: {
    namespace: ADMIN_INTERFACE_NAMESPACE, key: CHAT_AGENT_PLUGINS_KEY, scope, value,
    ...input, callerPrincipalId: input.principalId, authWorkspaceId: input.workspaceId,
  } });
  return { repo, settings, input, change, preferences: composeAgentPluginPreferences({ settings }) };
}

test('Auto saving refuses a personal-mode change made after approval was prepared', async () => {
  const f = fixture();
  const initial = await f.change('ask');
  await f.change('off');
  const revisions = await f.repo.listRevisions({ settingId: 'plugin-mode' });
  await assert.rejects(f.preferences.saveAuto({ ...f.input, expectedRevisionSeq: initial.revisionSeq }), SettingsRevisionConflictError);
  assert.equal(await f.preferences.mode(f.input), 'off');
  assert.deepEqual(await f.repo.listRevisions({ settingId: 'plugin-mode' }), revisions, 'rejected write leaves no extra revision');
});

test('snapshot includes effective mode and the addressed personal revision', async () => {
  const f = fixture();
  await f.change('ask', 'workspace');
  assert.deepEqual(await f.preferences.snapshot(f.input), { mode: 'ask', revisionSeq: 0 });
  const written = await f.change('off');
  assert.deepEqual(await f.preferences.snapshot(f.input), { mode: 'off', revisionSeq: written.revisionSeq });
  assert.deepEqual(await f.preferences.snapshot({ ...f.input, principalId: 'bob' }), { mode: 'ask', revisionSeq: 0 });
  await f.preferences.saveAuto({ ...f.input, expectedRevisionSeq: written.revisionSeq });
  assert.equal(await f.preferences.mode(f.input), 'auto');
});

test('snapshot preserves the revision of a cleared personal override', async () => {
  const f = fixture();
  await f.change('ask', 'workspace');
  await f.change('off');
  const cleared = await clear({ deps: f.settings, input: { namespace: ADMIN_INTERFACE_NAMESPACE, key: CHAT_AGENT_PLUGINS_KEY,
    scope: 'user', ...f.input, callerPrincipalId: f.input.principalId, authWorkspaceId: f.input.workspaceId } });
  assert.deepEqual(await f.preferences.snapshot(f.input), { mode: 'ask', revisionSeq: cleared.revisionSeq });
  await f.preferences.saveAuto({ ...f.input, expectedRevisionSeq: cleared.revisionSeq });
  assert.equal(await f.preferences.mode(f.input), 'auto');
});

test('a personal change during snapshot reading invalidates the later Auto save', async () => {
  const f = fixture();
  const before = await f.change('ask');
  const preferences = composeAgentPluginPreferences({ settings: f.settings, read: async (deps, input) => {
    await f.change('off');
    return getEffective(deps, input);
  } });
  const snapshot = await preferences.snapshot(f.input);
  assert.deepEqual(snapshot, { mode: 'off', revisionSeq: before.revisionSeq });
  await assert.rejects(preferences.saveAuto({ ...f.input, expectedRevisionSeq: snapshot.revisionSeq }), SettingsRevisionConflictError);
  assert.equal(await f.preferences.mode(f.input), 'off');
});
