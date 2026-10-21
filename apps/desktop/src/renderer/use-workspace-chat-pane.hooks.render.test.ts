/**
 * @file `useWorkspaceChatPane` rendered from its real module under jsdom (see
 * `dom-hook-harness.ts`), with its three `App.hooks.ts` collaborators injected through the hook's
 * ports. The pure pieces (`captureFolderDrop`, `workspaceConversationView`, the run context) have
 * direct tests in `use-workspace-chat-pane.hooks.test.ts`; this file asserts the composition.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { act, type DragEvent } from 'react';

import type { useConversationDeleteConfirmation, useRunnerConversations, useWorkspaceChatTransport } from './App.hooks.js';
import { renderHook } from './dom-hook-harness.js';
import { useWorkspaceChatPane } from './use-workspace-chat-pane.hooks.js';

type Transport = ReturnType<typeof useWorkspaceChatTransport>;

function ports(getPathForFile: Transport['getPathForFile']) {
  const transport = { transport: { name: 'transport' }, runtimeAccess: { name: 'runtime' }, workingDirectoryAccess: { name: 'cwd' },
    getPathForFile, uploadAttachments: async () => [] } as unknown as Transport;
  const conversations = { conversations: [{ id: 'c1', title: 'First' }], activeId: 'c1' } as unknown as ReturnType<typeof useRunnerConversations>;
  const deleteConfirmation = { pendingId: null } as unknown as ReturnType<typeof useConversationDeleteConfirmation>;
  return {
    transport, conversations, deleteConfirmation,
    options: { useTransport: () => transport, useConversations: () => conversations, useDeleteConfirmation: () => deleteConfirmation },
  };
}

test('the pane state passes its collaborators through and derives the conversation view', (t) => {
  const fake = ports(undefined);
  const hook = renderHook(t, () => useWorkspaceChatPane({}, fake.options));
  const pane = hook.current();
  assert.equal(pane.transport, fake.transport.transport);
  assert.equal(pane.runtimeAccess, fake.transport.runtimeAccess);
  assert.equal(pane.workingDirectoryAccess, fake.transport.workingDirectoryAccess);
  assert.equal(pane.uploadAttachments, fake.transport.uploadAttachments);
  assert.equal(pane.conversations, fake.conversations);
  assert.equal(pane.deleteConfirmation, fake.deleteConfirmation);
  assert.deepEqual(pane.listItems, [{ id: 'c1', title: 'First' }]);
  assert.deepEqual(pane.conversationIdProp, { conversationId: 'c1' });
  assert.equal(pane.workingDirectory, null);
  act(() => pane.setWorkingDirectory('/Users/x/Site'));
  assert.equal(hook.current().workingDirectory, '/Users/x/Site');
  assert.equal(hook.current().composerHandle, pane.composerHandle, 'the composer ref is stable across renders');
});

test('a folder dropped on the pane is written into the composer the ChatPane published', (t) => {
  const fake = ports((file) => (file as unknown as { path: string }).path);
  const hook = renderHook(t, () => useWorkspaceChatPane({}, fake.options));
  const inserted: string[] = [];
  hook.current().composerHandle.current = { insertText: (text: string) => void inserted.push(text) } as never;
  const calls: string[] = [];
  const event = {
    dataTransfer: {
      items: [{ kind: 'file', webkitGetAsEntry: () => ({ isDirectory: true }) }],
      files: [{ path: '/Users/x/Site' }],
    },
    preventDefault: () => calls.push('preventDefault'),
    stopPropagation: () => calls.push('stopPropagation'),
  } as unknown as DragEvent<HTMLElement>;
  hook.current().onDropCapture(event);
  assert.deepEqual(calls, ['preventDefault', 'stopPropagation']);
  assert.deepEqual(inserted, ['/Users/x/Site']);
});
