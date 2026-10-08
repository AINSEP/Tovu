import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolExecutionContext } from '@jini-ai/core';
import { createInMemoryConversationToolApprovalStore } from '../../../assistant/external-mcp-tool-approval-adapters.js';
import { createNativeApprovalMemory } from '../native-approval-memory.js';

const ctx = (principalId = 'human', runId = 'run'): ToolExecutionContext => ({ executionId: 'exec', principal: { id: principalId }, run: { id: runId }, input: {}, signal: new AbortController().signal });
test('native identity grants reuse the external store across chats, bound to workspace/human/digest', async () => {
  const store = createInMemoryConversationToolApprovalStore();
  const make = (workspaceId: string) => createNativeApprovalMemory({ store, workspaceId, clock: { nowMs: () => 0 }, conversationIdForRun: ({ runId }) => `chat:${runId}` });
  const memory = make('ws');
  assert.equal(await memory.has({ ctx: ctx(), key: 'plugin@v1/digest' }), false);
  await memory.grant({ ctx: ctx(), key: 'plugin@v1/digest', confirmer: { id: 'human', kind: 'user' } });
  assert.equal(await memory.has({ ctx: ctx('human', 'another-run'), key: 'plugin@v1/digest' }), true);
  assert.equal(await memory.has({ ctx: ctx('other'), key: 'plugin@v1/digest' }), false);
  assert.equal(await make('another-ws').has({ ctx: ctx(), key: 'plugin@v1/digest' }), false);
  assert.equal(await memory.has({ ctx: ctx(), key: 'plugin@v2/digest' }), false);
  assert.equal(await store.has({ conversationId: 'chat:run', principalId: 'human', connectionId: '["native-escalation","ws"]', toolName: 'plugin@v1/digest', fingerprint: 'plugin@v1/digest' }), true);
});

test('unbound conversations and mismatched humans cannot persist a grant', async () => {
  const memory = createNativeApprovalMemory({ store: createInMemoryConversationToolApprovalStore(), workspaceId: 'ws', clock: { nowMs: () => 0 }, conversationIdForRun: () => undefined });
  await assert.rejects(memory.grant({ ctx: ctx(), key: 'plugin', confirmer: { id: 'other', kind: 'user' } }), { message: 'NATIVE_APPROVAL_ACTOR_MISMATCH: The approval actor does not match this call. Nothing was changed.' });
  await assert.rejects(memory.grant({ ctx: ctx(), key: 'plugin', confirmer: { id: 'human', kind: 'user' } }), { message: 'NATIVE_APPROVAL_CONVERSATION_REQUIRED: The human approval could not be saved to this conversation. Nothing was changed.' });
  assert.equal(await memory.has({ ctx: ctx(), key: 'plugin' }), false);
});
