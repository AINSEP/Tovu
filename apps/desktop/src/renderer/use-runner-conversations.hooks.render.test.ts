import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { installDom, renderHook, settle } from './dom-hook-harness.js';
import { useRunnerConversations } from './use-runner-conversations.hooks.js';
import type { RunnerInventoryBridge } from './runner-api.js';

test('fleet history uses the desktop store and labels a transcript failure without wedging selection', async (t) => {
  const window = installDom();
  const before = Object.getOwnPropertyDescriptor(window, 'tovuRunner');
  const unavailable = new Error('transcript unavailable');
  const logs = t.mock.method(console, 'error', () => {});
  const inputs: { conversationId: string }[] = [];
  let listings = 0;
  const thread = { id: 'saved-thread', title: 'Launch notes', createdAt: 21, updatedAt: 27, messageCount: 1 };
  const other = { id: 'empty-thread', title: 'Next launch', createdAt: 31, updatedAt: 31, messageCount: 0 };
  const bridge = {
    listConversations: async () => { listings++; return [other, thread]; },
    loadConversationMessages: async (input) => {
      inputs.push(input);
      if (input.conversationId === thread.id) throw unavailable;
      assert.equal(input.conversationId, other.id);
      return [];
    },
  } satisfies Pick<RunnerInventoryBridge, 'listConversations' | 'loadConversationMessages'>;
  Object.defineProperty(window, 'tovuRunner', { configurable: true, value: bridge });
  t.after(() => {
    if (before) Object.defineProperty(window, 'tovuRunner', before);
    else Reflect.deleteProperty(window, 'tovuRunner');
  });
  const h = renderHook({ t, useHook: () => useRunnerConversations() });
  await settle();
  assert.deepEqual(h.current().conversations, [other, thread]);
  act(() => h.current().select(thread.id));
  await settle();
  assert.equal(h.current().activeId, thread.id);
  assert.deepEqual(h.current().initialMessages, []);
  assert.deepEqual(logs.mock.calls.map(({ arguments: args }) => args), [
    ['tovu-runner: fleet chat —', 'could not load conversation saved-thread —', unavailable],
  ]);
  act(() => h.current().select(other.id));
  await settle();
  assert.deepEqual(inputs, [{ conversationId: 'saved-thread' }, { conversationId: 'empty-thread' }]);
  assert.equal(h.current().activeId, 'empty-thread');
  assert.equal(listings, 1);
});
