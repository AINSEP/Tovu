/**
 * @file `WorkspaceChatPane` rendered from its real module under jsdom, with
 * `useWorkspaceChatPane`'s three hook ports faked (the same ports
 * `use-workspace-chat-pane.hooks.render.test.ts` uses). The hook's own logic is tested there; this
 * file asserts what the pane renders from that state and which callbacks its controls reach.
 *
 * `ConversationList` and `ChatPane` are recording stand-ins passed through the pane's `components`
 * seam: a linked `@jini-ai/chat` resolves its own React outside a bundler, and what this pane owns is
 * exactly the props it hands those two components.
 *
 * The pane has no call site in `App.tsx` (see `one-chat-fab-wiring.test.ts` for why), so this is
 * the only place its markup is exercised at all.
 */
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import React, { act, createElement, Fragment, isValidElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import type { useConversationDeleteConfirmation, useRunnerConversations, useWorkspaceChatTransport } from './App.hooks.js';
import { installDom, settle } from './dom-hook-harness.js';
import { WORKSPACE_RUN_CONTEXT } from './use-workspace-chat-pane.hooks.js';
import { WorkspaceChatPane } from './WorkspaceChatPane.js';

// `node --import tsx` compiles `.tsx` with the classic JSX runtime, which reads a global `React`.
(globalThis as { React?: typeof React }).React = React;

type Transport = ReturnType<typeof useWorkspaceChatTransport>;
type Conversations = ReturnType<typeof useRunnerConversations>;
type DeleteConfirmation = ReturnType<typeof useConversationDeleteConfirmation>;

interface Fakes {
  connected?: boolean;
  pendingTitle?: string | null;
}

/** The three ports, recording every callback the pane's controls reach. */
function fakePorts({ connected = true, pendingTitle = null }: Fakes = {}) {
  const calls: string[] = [];
  const runtimeAccess = {
    listAgents: async () => [],
    rescanAgents: async () => [],
    daemonOnline: async () => false,
  };
  const transport = {
    transport: connected ? { name: 'fleet' } : undefined,
    runtimeAccess: connected ? runtimeAccess : undefined,
    workingDirectoryAccess: undefined,
    getPathForFile: undefined,
    uploadAttachments: async () => [],
  } as unknown as Transport;
  const conversations = {
    conversations: [{ id: 'c1', title: 'Fleet triage' }, { id: 'c2', title: 'Deploy check' }],
    activeId: 'c1',
    paneKey: 'c1',
    initialMessages: [],
    select: (id: string) => calls.push(`select:${id}`),
    create: () => calls.push('create'),
    remove: (id: string) => calls.push(`remove:${id}`),
    rename: (id: string, title: string) => calls.push(`rename:${id}:${title}`),
    onMessagesChange: () => {},
  } as unknown as Conversations;
  const deleteConfirmation = {
    pendingTitle,
    confirmDelete: async () => false,
    resolvePending: (confirmed: boolean) => calls.push(`resolve:${confirmed}`),
  } as unknown as DeleteConfirmation;
  const ports = { useTransport: () => transport, useConversations: () => conversations, useDeleteConfirmation: () => deleteConfirmation };
  const rendered: { list?: Record<string, unknown>; chat?: Record<string, unknown> } = {};
  const components = {
    ConversationList: (props: Record<string, unknown>) => { rendered.list = props; return null; },
    ChatPane: (props: Record<string, unknown>) => { rendered.chat = props; return createElement('textarea', { placeholder: props.placeholder }); },
  } as unknown as NonNullable<Parameters<typeof WorkspaceChatPane>[0]['components']>;
  return { ports, calls, components, rendered, transport, conversations, deleteConfirmation, runtimeAccess };
}

/** Mount the pane into its own root; unmounted when the test ends. */
async function renderPane(t: TestContext, fakes: Fakes = {}) {
  const window = installDom();
  const fake = fakePorts(fakes);
  const { ports, calls, components } = fake;
  const host = window.document.body.appendChild(window.document.createElement('div'));
  const root = createRoot(host);
  t.after(() => act(() => root.unmount()));
  act(() => root.render(createElement(WorkspaceChatPane, { onClose: () => calls.push('close'), ports, components })));
  await settle();
  const click = (button: Element | null | undefined) => {
    assert.ok(button, 'expected the button to be rendered');
    act(() => (button as HTMLButtonElement).click());
  };
  const byText = (text: string) => [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === text);
  return { host, calls, click, byText, fake };
}

test('without a fleet transport the pane says why there is no chat, and renders neither chat component', async (t) => {
  const { host, calls, click, fake } = await renderPane(t, { connected: false });
  assert.ok(host.querySelector('aside[aria-label="Runner chat"]'));
  assert.equal(host.querySelector('.runner-chat-pane__status')?.textContent?.trim(), 'Open Runner desktop to scan locally installed agent CLIs.');
  assert.deepEqual(fake.rendered, {}, 'no conversation switcher and no chat pane without a transport');
  assert.equal(host.querySelector('[role="alertdialog"]'), null);
  click(host.querySelector('button[aria-label="Close Runner chat"]'));
  assert.deepEqual(calls, ['close']);
});

test('with a fleet transport the switcher and the chat pane get the hook state, under the pane\'s own header', async (t) => {
  const { host, fake } = await renderPane(t);
  assert.equal(host.querySelector('.runner-chat-pane__status'), null);
  const { list, chat } = fake.rendered;
  assert.deepEqual(list?.conversations, [{ id: 'c1', title: 'Fleet triage' }, { id: 'c2', title: 'Deploy check' }]);
  assert.equal(list?.activeConversationId, 'c1');
  assert.equal(list?.onSelect, fake.conversations.select);
  assert.equal(list?.onCreate, fake.conversations.create);
  assert.equal(list?.onDelete, fake.conversations.remove);
  assert.equal(list?.onRename, fake.conversations.rename);
  assert.equal(list?.confirmDelete, fake.deleteConfirmation.confirmDelete);

  assert.equal(chat?.transport, fake.transport.transport);
  assert.equal(chat?.runtimeAccess, fake.runtimeAccess);
  assert.equal(chat?.runContext, WORKSPACE_RUN_CONTEXT);
  assert.equal(chat?.conversationId, 'c1', 'the active conversation id is spread in from conversationIdProp');
  assert.equal(chat?.initialMessages, fake.conversations.initialMessages);
  assert.equal(chat?.onMessagesChange, fake.conversations.onMessagesChange);
  assert.equal(chat?.variant, 'workspace');
  assert.equal(chat?.workingDirectory, null);
  assert.equal(chat?.uploadAttachments, fake.transport.uploadAttachments);
  // An empty fragment, not `undefined`: `ChatPane` falls back to its own default header on `undefined`.
  assert.ok(isValidElement(chat?.header) && (chat.header as ReactElement).type === Fragment);
  assert.equal(host.querySelector('textarea')?.getAttribute('placeholder'), 'Ask about the fleet, or tell it what to run');
  assert.equal(host.querySelector('.runner-chat-pane__head h2')?.textContent, 'Workspace chat');
});

test('the working directory the chat pane picks is held by the pane and handed back on the next render', async (t) => {
  const { fake } = await renderPane(t);
  act(() => (fake.rendered.chat?.onChangeWorkingDirectory as (dir: string) => void)('/Users/x/Site'));
  assert.equal(fake.rendered.chat?.workingDirectory, '/Users/x/Site');
});

test('a pending delete renders an inline confirmation whose buttons answer it', async (t) => {
  const { host, calls, click, byText } = await renderPane(t, { pendingTitle: 'Fleet triage' });
  const dialog = host.querySelector('[role="alertdialog"][aria-label="Confirm delete"]');
  assert.equal(dialog?.querySelector('p')?.textContent?.trim(), 'Delete “Fleet triage”? This can’t be undone.');
  click(byText('Cancel'));
  click(byText('Delete'));
  assert.deepEqual(calls, ['resolve:false', 'resolve:true']);
});
