import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENT_DEFS } from '@jini-ai/agent-runtime';
import { InMemorySettingsRepo, ensureSettingDefinitions, getEffective } from '@jini-ai/core/settings';
import { ensureExecutionSettingDefinitions } from '#src/assistant/execution-mode-settings';
import { allowAssistantRunTools } from '../assistant-tool-access.js';

test('BUG T-B01: the consent write preserves a null rejection', async () => {
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowMs: () => 1_791_504_000_000, nowIso: () => '2026-10-09T00:00:00.000Z' };
  let id = 0;
  const idGen = { newId: () => `consent-${++id}` };
  await ensureExecutionSettingDefinitions({ settingsRepo, clock, ids: idGen,
    principals: { findActiveById: async () => null }, ensureSettingDefinitions }, { systemPrincipalId: 'system' });

  let checks = 0;
  const deps = { workspaceId: 'site-one', settingsReady: Promise.resolve(), settingsUiTabsReady: Promise.resolve(),
    settingsRepo, clock, idGen, getEffective, ownerPrincipalId: Promise.resolve('owner'),
    principalRepo: { findById: async () => null },
    authorize: async () => {
      if (++checks === 2) throw null; // The writer's own authorization, after the initial consent check.
      return { allowed: true, reason: 'fixture' };
    },
  } as unknown as Parameters<typeof allowAssistantRunTools>[0]['deps'];

  await assert.rejects(allowAssistantRunTools({ deps, env: {}, principalId: 'owner', agentId: 'antigravity',
    getDef: ({ id: requested }) => AGENT_DEFS.find(def => def.id === requested) ?? null,
    keys: ['userMcp'], expectedRevisionSeq: 0, isLive: () => true,
  }), (reason: unknown) => reason === null);
});
