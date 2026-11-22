import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '@jini-ai/chat/core';

import { persistableMessages } from '@jini-ai/chat/core';

// Author Checklist: reject saving running replies, dropping failed/canceled replies,
// requiring a terminal status on user turns, or caching the first filtered result.
// F4.1/F6.2: literal terminal statuses, not the predicate being exercised by the subject.
test('keeps user turns and every terminal assistant turn, omitting queued, running and unstamped replies', () => {
  const messages: readonly ChatMessage[] = Object.freeze([
    { id: 'queued', role: 'assistant', content: 'waiting', runStatus: 'queued' },
    { id: 'user', role: 'user', content: 'my question', attachments: [{ path: '/staged/a.png', name: 'a.png', kind: 'image' }] },
    { id: 'pending', role: 'user', content: 'outgoing', inputPending: true },
    { id: 'succeeded', role: 'assistant', content: 'answer', runStatus: 'succeeded' },
    { id: 'running', role: 'assistant', content: 'partial', runStatus: 'running' },
    { id: 'failed', role: 'assistant', content: 'failure details', runStatus: 'failed' },
    { id: 'unstamped', role: 'assistant', content: 'not settled' },
    { id: 'canceled', role: 'assistant', content: 'cancel details', runStatus: 'canceled' },
  ]);
  assert.deepEqual(persistableMessages({ messages }, { includePendingUser: true }), [
    { id: 'user', role: 'user', content: 'my question', attachments: [{ path: '/staged/a.png', name: 'a.png', kind: 'image' }] },
    { id: 'pending', role: 'user', content: 'outgoing', inputPending: true },
    { id: 'succeeded', role: 'assistant', content: 'answer', runStatus: 'succeeded' },
    { id: 'failed', role: 'assistant', content: 'failure details', runStatus: 'failed' },
    { id: 'canceled', role: 'assistant', content: 'cancel details', runStatus: 'canceled' },
  ]);
  assert.deepEqual(messages.map((message) => message.id), ['queued', 'user', 'pending', 'succeeded', 'running', 'failed', 'unstamped', 'canceled']);
});

test('a user turn survives even when it carries a nonterminal status', () => {
  assert.deepEqual(persistableMessages({ messages: [{ id: 'u', role: 'user', content: 'keep me', runStatus: 'running' }] }, { includePendingUser: true }), [
    { id: 'u', role: 'user', content: 'keep me', runStatus: 'running' },
  ]);
});

test('a reply becomes persistable when a later call receives its terminal status', () => {
  const reply: ChatMessage = { id: 'reply', role: 'assistant', content: 'stream', runStatus: 'running' };
  assert.deepEqual(persistableMessages({ messages: [reply] }, { includePendingUser: true }), []);
  assert.deepEqual(persistableMessages({ messages: [{ ...reply, content: 'finished', runStatus: 'succeeded' }] }, { includePendingUser: true }), [
    { id: 'reply', role: 'assistant', content: 'finished', runStatus: 'succeeded' },
  ]);
  assert.deepEqual(persistableMessages({ messages: [] }, { includePendingUser: true }), []);
});
