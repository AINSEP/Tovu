import assert from 'node:assert/strict';
import test from 'node:test';
import { createContributionRegistry, type ToolExecutionContext } from '@jini-ai/core';
import type { ToolContributor, DerivedToolContributor } from '#src/assistant/index';
import { createChatStoreFactory } from '#src/assistant/persistence/store-factory';
import { openChatDb } from '#src/platform/db/sqlite/chat-db';
import { nativeToolMetadata } from '#src/contracts/core/tool-metadata/index';
import type { SiteChatHistory } from '../site-chat-history.js';
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
  const deps: AssistantHistoryHostDeps = { workspaceId: 'site-a', ownerPrincipalId: Promise.resolve('owner'), chatHistory, authorize: async input => { grants.push(input); return { allowed: true, reason: 'matched' }; } };
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
  const deps: AssistantHistoryHostDeps = { workspaceId: 'site', ownerPrincipalId: Promise.resolve('owner'), authorize: async () => ({ allowed: false, reason: 'denied' }),
    chatHistory: () => { stores++; throw new Error('scope factory must not run'); } };
  for (const [id, input] of [['assistant_chats_list', {}], ['assistant_chat_read', { chatId: 'chat' }]] as const) {
    await assert.rejects(call(deps, id, 'caller', input), /unavailable to this caller/);
  }
  await assert.rejects(call({ ...deps, authorize: async () => { throw new Error('auth unavailable'); } }, 'assistant_chats_list', 'caller', {}), /auth unavailable/);
  assert.equal(stores, 0);
});

test('the shared daemon/BYOK manifest installs both tools with projected read metadata and resume guidance', () => {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  assert.ok(contributions.contributors.list({}).some(contribution => contribution.domain === 'assistant-history'));
  const deps: AssistantHistoryHostDeps = { workspaceId: 'site', ownerPrincipalId: Promise.resolve('owner'), authorize: async () => ({ allowed: true, reason: 'matched' }), chatHistory: () => { throw new Error('no eager read'); } };
  const tools = buildAssistantHistoryTools({ deps }, {});
  assert.deepEqual(tools.map(tool => tool.descriptor.id), ['assistant_chats_list', 'assistant_chat_read']);
  for (const tool of tools) {
    assert.deepEqual(tool.descriptor.metadata, nativeToolMetadata.byId[tool.descriptor.id]);
    assert.equal(tool.descriptor.metadata?.approval?.class, 'read');
    assert.match(tool.descriptor.description ?? '', /summarise the state/);
    assert.equal((tool.descriptor.inputSchema as { additionalProperties: boolean }).additionalProperties, false);
  }
});


/** Capture the actual host ports without requiring the next published Jini tool schema. */
function capturePorts(deps: AssistantHistoryHostDeps) {
  const captured: { ports?: { getStore: (required: { principalId: string }, optional?: Record<string, never>) => Promise<import('@jini-ai/chat/core').ChatHistoryStore>;
    siteHistory?: Omit<SiteChatHistory, 'isCurrentSite'> } } = {};
  buildAssistantHistoryTools({ deps }, { buildRegistrations: ({ ports }) => { captured.ports = ports; return []; } });
  assert.ok(captured.ports?.siteHistory);
  return captured.ports;
}

test('site ports authorize first, then require this installation owner before registry access', async t => {
  let touched = 0;
  const sourceCalls: unknown[] = [];
  const db = openChatDb(':memory:');
  t.after(() => db.close());
  const local = createChatStoreFactory(db);
  const siteStore = local({ kind: 'user', workspaceId: 'other', userId: 'target-owner' });
  const siteChatHistory: SiteChatHistory = {
    isCurrentSite: ({ siteName }) => { touched++; return siteName === 'current'; },
    listSiteNames: async required => { touched++; sourceCalls.push(required); return ['other']; },
    openStore: async required => { touched++; sourceCalls.push(required); return { store: siteStore, close() {} }; },
  };
  const grants: unknown[] = [];
  const deps: AssistantHistoryHostDeps = { workspaceId: 'current-workspace', ownerPrincipalId: Promise.resolve('current-owner'),
    authorize: async required => { grants.push(required); return { allowed: true, reason: 'matched' }; }, chatHistory: local, siteChatHistory };
  const denied = capturePorts({ ...deps, authorize: async () => ({ allowed: false, reason: 'denied' }) }).siteHistory!;
  await assert.rejects(denied.openStore({ principalId: 'current-owner', siteName: 'other' }), /Chat history is unavailable to this caller/);
  await assert.rejects(denied.listSiteNames({ principalId: 'current-owner' }), /Chat history is unavailable to this caller/);
  assert.equal(touched, 0);
  const ports = capturePorts(deps);
  await assert.rejects(ports.siteHistory!.openStore({ principalId: 'admin', siteName: 'other' }), /Only this installation's owner/);
  await assert.rejects(ports.siteHistory!.listSiteNames({ principalId: 'admin' }), /Only this installation's owner/);
  assert.equal(touched, 0);
  assert.deepEqual(await ports.siteHistory!.listSiteNames({ principalId: 'current-owner' }), ['other']);
  const opened = await ports.siteHistory!.openStore({ principalId: 'current-owner', siteName: 'other' });
  assert.equal(opened?.store, siteStore);
  assert.deepEqual(sourceCalls, [{ principalId: 'current-owner' }, { principalId: 'current-owner', siteName: 'other' }]);
  const current = await ports.siteHistory!.openStore({ principalId: 'current-owner', siteName: 'current' });
  assert.ok(current);
  await current.store.create({ id: 'local-chat' });
  assert.ok(await local({ kind: 'user', workspaceId: 'current-workspace', userId: 'current-owner' }).get({ id: 'local-chat' }));
  assert.equal(await siteStore.get({ id: 'local-chat' }), null);
  await current.close();
  assert.equal(sourceCalls.length, 2);
  assert.ok(grants.every((grant: any) => grant.workspaceId === 'current-workspace' && grant.permission === 'admin.assistant.use'));
});
