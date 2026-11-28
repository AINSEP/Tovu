import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantRunPlan, assistantToolSetupMessage, readAssistantRunToolPolicy, type AssistantRunToolPolicyInput } from '../assistant-run-tool-policy.js';

test('setup distinguishes an uninstalled CLI from an installed CLI that needs a sign-in', () => {
  assert.equal(assistantToolSetupMessage({ name: 'Codex', reason: 'not_installed' }),
    "Codex isn't installed. Install it or pick another agent.");
  assert.equal(assistantToolSetupMessage({ name: 'Codex', reason: 'not_signed_in' }),
    "Codex isn't signed in. Sign in once, then send again.");
});

test('setup explains the applicable host lock and names the requested tool switches', () => {
  const required = { name: 'Claude Code', reason: 'tool_access', keys: ['web', 'subagents'] as const };
  assert.equal(assistantToolSetupMessage({ ...required, lock: 'not_owner' }),
    'Claude Code needs web, subagents on, and only the owner can turn them on.');
  assert.equal(assistantToolSetupMessage({ ...required, lock: 'hosted' }),
    "Claude Code needs web, subagents on, and they're off on hosted sites.");
  assert.equal(assistantToolSetupMessage({ ...required, lock: 'TOVU_AGENT_FULL_CLI_ACCESS' }),
    'Claude Code needs web, subagents on, and TOVU_AGENT_FULL_CLI_ACCESS turns them off here.');
  assert.equal(assistantToolSetupMessage(required),
    'Claude Code needs web, subagents on, and the host policy turns them off here.');
});

test('setup without requested switches still names the host reason', () => {
  assert.equal(assistantToolSetupMessage({ name: 'Codex', reason: 'tool_access', lock: 'hosted' }),
    "Codex needs  on, and they're off on hosted sites.");
});

test('a non-owner whose agent definition is missing gets SETUP not_installed with every switch off', async () => {
  const lookups: string[] = [];
  const snapshot = await readAssistantRunToolPolicy({
    deps: { ownerPrincipalId: Promise.resolve('owner') } as AssistantRunToolPolicyInput['deps'],
    principalId: 'guest', agentId: 'gone-agent', env: {},
    getDef: ({ id }) => { lookups.push(id); return null; },
  });
  assert.deepEqual(lookups, ['gone-agent']);
  assert.equal(snapshot.isOwner, false);
  assert.equal(snapshot.def, null);
  assert.equal(snapshot.lock, 'not_owner');
  assert.equal(snapshot.settingsSource, 'default');
  assert.equal(snapshot.policy.nativeToolAccess, false);
  assert.deepEqual(assistantRunPlan({ snapshot, installed: true, auth: 'ok' }), { verdict: 'SETUP', reason: 'not_installed' });
});
