import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createContributionRegistry, type ToolExecutionContext } from '@jini-ai/core';
import type { ToolContributor, DerivedToolContributor } from '@jini-ai/core';
import type { AssistantToolRegistryDeps } from '#src/assistant/tool-registrations';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { createChatStoreFactory } from '#src/assistant/persistence/store-factory';
import { openChatDb } from '#src/platform/db/sqlite/chat-db';
import { nativeToolMetadata } from '#src/contracts/core/tool-metadata/index';
import { buildAssistantHistoryTools, type AssistantHistoryHostDeps } from '../assistant-history-tools.js';
import { installFirstPartyToolContributors } from '../tool-catalog-manifest.js';

function call(deps: AssistantHistoryHostDeps, id: string, userId: string, input: unknown) {
  const tool = buildAssistantHistoryTools({ deps }, {}).find(tool => tool.descriptor.id === id)!;
  const context: ToolExecutionContext = { executionId: 'exec', principal: { id: userId }, run: { id: 'run' }, input, signal: new AbortController().signal };
  return tool.handler(context);
}

test('binds the current user and site to real persistence, including owner; refuses cross-user IDs', async t => {
  const db = openChatDb(':memory:');
  t.after(() => db.close());
  const chatHistory = createChatStoreFactory(db);
  const grants: unknown[] = [];
  const deps: AssistantHistoryHostDeps = { workspaceId: 'site-a', chatHistory, authorize: async input => { grants.push(input); return { allowed: true, reason: 'matched' }; } };
  for (const [id, workspaceId, userId] of [['owner-chat', 'site-a', 'owner'], ['other-chat', 'site-a', 'other'], ['other-site', 'site-b', 'owner']]) {
    const store = chatHistory({ kind: 'user', workspaceId: workspaceId!, userId: userId! });
    await store.create({ id: id!, title: 'Theme plan' });
    await store.appendMessage({ conversationId: id!, message: { id: `${id}-message`, role: 'user', content: 'Continue the theme work\nMore prose' } });
  }
  const owner = await call(deps, 'assistant_chats_list', 'owner', { query: 'theme' }) as any;
  assert.deepEqual(owner.chats.map((row: any) => row.id), ['owner-chat']);
  assert.equal(owner.chats[0].firstUserLine, 'Continue the theme work');
  assert.equal(owner.chats[0].messageCount, 1);
  const other = await call(deps, 'assistant_chats_list', 'other', {}) as any;
  assert.deepEqual(other.chats.map((row: any) => row.id), ['other-chat']);
  const ownRead = await call(deps, 'assistant_chat_read', 'owner', { chatId: 'owner-chat' }) as any;
  assert.equal(ownRead.messages[0].content, 'Continue the theme work\nMore prose');
  for (const chatId of ['owner-chat', 'other-site', 'missing']) await assert.rejects(call(deps, 'assistant_chat_read', 'other', { chatId }), /Chat is unavailable to this caller/);
  await assert.rejects(call(deps, 'assistant_chat_read', 'owner', { chatId: 'other-chat' }), /Chat is unavailable to this caller/);
  await assert.rejects(call(deps, 'assistant_chats_list', 'other', { userId: 'owner' }), /Unexpected chat history input/);
  assert.ok(grants.every((input: any) => input.workspaceId === 'site-a' && input.permission === 'admin.assistant.use'));
});

test('permission denial and authorization errors cannot reach the scope factory', async () => {
  let stores = 0;
  const deps: AssistantHistoryHostDeps = { workspaceId: 'site', authorize: async () => ({ allowed: false, reason: 'denied' }),
    chatHistory: () => { stores++; throw new Error('scope factory must not run'); } };
  for (const [id, input] of [['assistant_chats_list', {}], ['assistant_chat_read', { chatId: 'chat' }]] as const) {
    await assert.rejects(call(deps, id, 'caller', input), /unavailable to this caller/);
  }
  await assert.rejects(call({ ...deps, authorize: async () => { throw new Error('auth unavailable'); } }, 'assistant_chats_list', 'caller', {}), /auth unavailable/);
  assert.equal(stores, 0);
});

test('the shared daemon/BYOK manifest installs both tools with projected read metadata and resume guidance', () => {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  assert.ok(contributions.contributors.list({}).some(contribution => contribution.domain === 'assistant-history'));
  const deps: AssistantHistoryHostDeps = { workspaceId: 'site', authorize: async () => ({ allowed: true, reason: 'matched' }), chatHistory: () => { throw new Error('no eager read'); } };
  const tools = buildAssistantHistoryTools({ deps }, {});
  assert.deepEqual(tools.map(tool => tool.descriptor.id), ['assistant_chats_list', 'assistant_chat_read']);
  for (const tool of tools) {
    assert.deepEqual(tool.descriptor.metadata, nativeToolMetadata.byId[tool.descriptor.id]);
    assert.equal(tool.descriptor.metadata?.approval?.class, 'read');
    assert.match(tool.descriptor.description ?? '', /summarise the state/);
    assert.equal((tool.descriptor.inputSchema as { additionalProperties: boolean }).additionalProperties, false);
  }
});


test('history exposes only getStore; generic target scoping owns site selection', () => {
  let keys: string[] = [];
  const deps: AssistantHistoryHostDeps = { workspaceId: 'site', authorize: async () => ({ allowed: true, reason: 'matched' }),
    chatHistory: () => { throw new Error('no eager reads'); } };
  buildAssistantHistoryTools({ deps }, { buildRegistrations: ({ ports }) => { keys = Object.keys(ports); return []; } });
  assert.deepEqual(keys, ['getStore']);
});
