import assert from 'node:assert/strict';
import test from 'node:test';
import { createConversationStore, type ConversationStorePorts } from './workspace-conversation-store.ts';
import type { ToolGapEntry } from '@jini-ai/daemon/tool-audit';

test('desktop gap revisions persist with conversations and survive later message saves', () => {
  let file: unknown = null;
  const ports: ConversationStorePorts = {
    read: () => file === null ? { state: 'missing' } : { state: 'ok', value: file },
    write: (_path, value) => { file = structuredClone(value); }, now: () => 1, newId: () => 'chat', withLock: (_path, critical) => critical(),
  };
  const store = createConversationStore({ filePath: 'memory' }, ports);
  store.create();
  const entry: ToolGapEntry = { id: 'gap', at: '2026-10-17T00:00:00Z', site: 'site', chatId: 'chat', runId: 'r', provider: 'codex', toolUsed: 'apply_patch', summary: '/tmp/a', type: 'tool_gap', gapLine: null };
  store.appendToolGap({ entry }, {});
  store.saveMessage({ conversationId: 'chat', message: { id: 'm', role: 'user', content: 'hello', createdAt: 1 } });
  store.appendToolGap({ entry: { ...entry, type: 'tool_gap', gapLine: 'Tool gap: edit — no Tovu tool for it.' } }, {});
  const reopened = createConversationStore({ filePath: 'memory' }, ports);
  assert.equal(reopened.listToolGaps({}, {}).length, 1);
  assert.match(reopened.listToolGaps({}, {})[0]?.gapLine ?? '', /Tool gap: edit/);
  assert.equal(reopened.loadMessages({ conversationId: 'chat' })[0]?.content, 'hello');
});
