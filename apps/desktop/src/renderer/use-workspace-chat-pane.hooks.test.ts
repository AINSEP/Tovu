/**
 * @file Behavioural tests for `use-workspace-chat-pane.hooks.ts`'s plain exports —
 * `captureFolderDrop`, `workspaceConversationView`, `WORKSPACE_RUN_CONTEXT` — run against the real
 * code. `useWorkspaceChatPane` and `WorkspaceChatPane` are rendered from their real modules in
 * `use-workspace-chat-pane.hooks.render.test.ts` and `WorkspaceChatPane.render.test.ts`; the last
 * test here is a source-text guard that the component holds no React state of its own.
 *
 * Drop events use the same plain-object stand-ins `folder-drop.test.ts` uses: nothing under test
 * reads a real DOM property, only `kind`, `webkitGetAsEntry`, `isDirectory`, `items` and `files`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  captureFolderDrop,
  WORKSPACE_RUN_CONTEXT,
  workspaceConversationView,
} from './use-workspace-chat-pane.hooks.js';
import type { WorkspaceConversationSummary } from '../contracts/workspace-conversations.js';

/** One dragged entry: `path` is what `getPathForFile` answers for its `File`. */
interface DraggedEntry {
  path: string;
  isDirectory: boolean;
}

/** A drop of `entries`, with `preventDefault`/`stopPropagation` recorded into `calls` in order. */
function recordingDrop(entries: readonly DraggedEntry[]) {
  const calls: string[] = [];
  const files = entries.map((entry) => ({ path: entry.path }) as unknown as File);
  const items = entries.map(
    (entry) =>
      ({ kind: 'file', webkitGetAsEntry: () => ({ isDirectory: entry.isDirectory }) }) as unknown as DataTransferItem,
  );
  const event = {
    dataTransfer: { items, files } as unknown as DataTransfer,
    preventDefault: () => {
      calls.push('preventDefault');
    },
    stopPropagation: () => {
      calls.push('stopPropagation');
    },
  };
  const getPathForFile = (file: File) => (file as unknown as { path: string }).path;
  const composer = {
    current: {
      insertText: (text: string) => {
        calls.push(`insertText:${text}`);
      },
    },
  };
  return { calls, event, getPathForFile, composer };
}

// ---------------------------------------------------------------------------------------------
// captureFolderDrop
// ---------------------------------------------------------------------------------------------

test('a dropped folder is swallowed and its path written into the composer draft', () => {
  const { calls, event, getPathForFile, composer } = recordingDrop([{ path: '/Users/x/Site', isDirectory: true }]);
  captureFolderDrop(event, getPathForFile, composer);
  assert.deepEqual(calls, ['preventDefault', 'stopPropagation', 'insertText:/Users/x/Site']);
});

test('several dropped folders go in as ONE space-joined insert, in drop order, loose files skipped', () => {
  const { calls, event, getPathForFile, composer } = recordingDrop([
    { path: '/a/One', isDirectory: true },
    { path: '/a/loose.txt', isDirectory: false },
    { path: '/a/Two', isDirectory: true },
  ]);
  captureFolderDrop(event, getPathForFile, composer);
  assert.deepEqual(calls, ['preventDefault', 'stopPropagation', 'insertText:/a/One /a/Two']);
});

test('a drop with no folder in it passes through untouched, so ChatPane can stage it as an attachment', () => {
  const { calls, event, getPathForFile, composer } = recordingDrop([{ path: '/a/loose.txt', isDirectory: false }]);
  captureFolderDrop(event, getPathForFile, composer);
  assert.deepEqual(calls, []);
});

test('without a desktop bridge (no getPathForFile) even a folder drop passes through untouched', () => {
  const { calls, event, composer } = recordingDrop([{ path: '/Users/x/Site', isDirectory: true }]);
  captureFolderDrop(event, undefined, composer);
  assert.deepEqual(calls, []);
});

test('a folder whose path cannot be recovered is not a folder drop — the event passes through', () => {
  const { calls, event, composer } = recordingDrop([{ path: '', isDirectory: true }]);
  captureFolderDrop(event, () => '', composer);
  assert.deepEqual(calls, []);
});

test('a folder drop before ChatPane publishes its composer handle is still swallowed, with nothing inserted', () => {
  const { calls, event, getPathForFile } = recordingDrop([{ path: '/Users/x/Site', isDirectory: true }]);
  captureFolderDrop(event, getPathForFile, { current: null });
  assert.deepEqual(calls, ['preventDefault', 'stopPropagation']);
});

// ---------------------------------------------------------------------------------------------
// workspaceConversationView
// ---------------------------------------------------------------------------------------------

const SUMMARIES: readonly WorkspaceConversationSummary[] = [
  { id: 'c1', title: 'First', messageCount: 2, createdAt: 1, updatedAt: 2 },
  { id: 'c2', title: null, messageCount: 0, createdAt: 3, updatedAt: 3 },
];

test('the conversation list gets a COPY of the readonly list: same items, same order, new array', () => {
  const { listItems } = workspaceConversationView({ conversations: SUMMARIES, activeId: null });
  assert.notEqual(listItems, SUMMARIES);
  assert.deepEqual(listItems, SUMMARIES);
});

test('no conversationId prop at all while nothing is active', () => {
  const { conversationIdProp } = workspaceConversationView({ conversations: SUMMARIES, activeId: null });
  assert.deepEqual(conversationIdProp, {});
  assert.equal(Object.hasOwn(conversationIdProp, 'conversationId'), false);
});

test('the active conversation id is passed through when one is active', () => {
  const { conversationIdProp } = workspaceConversationView({ conversations: SUMMARIES, activeId: 'c2' });
  assert.deepEqual(conversationIdProp, { conversationId: 'c2' });
});

// ---------------------------------------------------------------------------------------------
// WORKSPACE_RUN_CONTEXT
// ---------------------------------------------------------------------------------------------

/** A run-context input with only `selection` varying. */
function runInput(selection: { agentId: string; model?: string; reasoning?: string }) {
  return { prompt: 'hello', workingDirectory: null, selection };
}

test('the run context is empty when the operator picked neither a model nor a reasoning level', () => {
  const context = WORKSPACE_RUN_CONTEXT(runInput({ agentId: 'claude' }));
  assert.deepEqual(context, {});
  assert.equal(Object.hasOwn(context, 'model'), false);
  assert.equal(Object.hasOwn(context, 'reasoning'), false);
});

test('the run context carries each picked field and only that field', () => {
  assert.deepEqual(WORKSPACE_RUN_CONTEXT(runInput({ agentId: 'claude', model: 'opus' })), { model: 'opus' });
  assert.deepEqual(WORKSPACE_RUN_CONTEXT(runInput({ agentId: 'claude', reasoning: 'high' })), { reasoning: 'high' });
  assert.deepEqual(WORKSPACE_RUN_CONTEXT(runInput({ agentId: 'claude', model: 'opus', reasoning: 'high' })), {
    model: 'opus',
    reasoning: 'high',
  });
});

// ---------------------------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------------------------

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

test('WorkspaceChatPane uses no raw React primitives: all of its state comes from useWorkspaceChatPane', () => {
  // Source text because only the text can say where state lives. What the pane renders from the
  // hook, and the drop and composer wiring, are rendered for real in `WorkspaceChatPane.render.test.ts`
  // and `use-workspace-chat-pane.hooks.render.test.ts`.
  const app = withoutComments(fs.readFileSync(path.join(import.meta.dirname, 'WorkspaceChatPane.tsx'), 'utf8'));
  const start = app.indexOf('function WorkspaceChatPane(');
  assert.notEqual(start, -1, 'WorkspaceChatPane is gone from WorkspaceChatPane.tsx');
  const rest = app.slice(start + 1);
  const end = rest.indexOf('\nfunction ');
  const body = end === -1 ? rest : rest.slice(0, end);
  assert.match(body, /\} = useWorkspaceChatPane\(\{\}, ports\);/);
  assert.doesNotMatch(body, /\buse(State|Ref|Callback|Effect|Memo)\b/, 'raw React primitives are back in the component');
});
