import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantToolSetupMessage } from '../assistant-run-tool-policy.js';

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
