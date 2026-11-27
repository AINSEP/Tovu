/**
 * @file The hooks `App.hooks.ts` re-exports, rendered together THROUGH the barrel with no ports
 * injected, so every bridge lookup falls back to its real default (`runnerInventoryBridge`, i.e.
 * `window.tovuRunner`). Each family's own behaviour — fakes injected through its `getBridge`,
 * interval, timer and document ports — is tested beside it (`use-<thing>.hooks.render.test.ts`);
 * this file keeps the one case that only the defaults can show: with no preload, nothing throws and
 * nothing reaches for IPC. `window.tovuRunner` is never set here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import type { CreateSiteInput } from '../contracts/project.js';
import type { WorkspaceChatEventMessage } from '../contracts/workspace-chat.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { renderHookWithView as renderHook, settle, site } from './app-hooks.test-support.js';
import { installDom } from './dom-hook-harness.js';
import {
  useProjectMutations,
  useProjectTabs,
  useRunnerConversations,
  useRunnerNavigation,
  useSectionNav,
  useSiteRescan,
  useSiteStart,
  useSitesPolling,
  useWorkspaceChatTransport,
} from './App.hooks.js';
import { useWebviewLoadFailure } from '@jini-ai/ui/live-views';

// Installed up front: the first assertion below reads the jsdom `window` before any render.
const window = installDom();

const INPUT: CreateSiteInput = { displayName: 'new', database: { kind: 'sqlite' } };

// ── the default bridge lookup ───────────────────────────────────────────────────────────────────

test('with the default lookup and no preload (`window.tovuRunner` unset) every bridge-reading hook stays inert', async (t) => {
  assert.equal((window as { tovuRunner?: unknown }).tovuRunner, undefined);
  const calls: string[] = [];
  const hook = renderHook(t, () => {
    const polling = useSitesPolling();
    const rescan = useSiteRescan({ setProjects: polling.setProjects });
    const tabs = useProjectTabs();
    const nav = useSectionNav({ setActiveTab: tabs.setActiveTab });
    useRunnerNavigation({ setActiveId: nav.setActiveId, setActiveTab: tabs.setActiveTab });
    const mutations = useProjectMutations({
      setProjects: polling.setProjects, closeProjectTab: () => calls.push('close'),
      stopCreating: () => calls.push('stop'), startCreating: () => calls.push('start'),
    });
    const start = useSiteStart({ project: site('a') });
    const load = useWebviewLoadFailure({ resetKey: 0 });
    const transport = useWorkspaceChatTransport();
    const conversations = useRunnerConversations();
    return { polling, rescan, mutations, start, load, transport, conversations };
  });
  await settle();
  const value = hook.current();
  assert.deepEqual([value.polling.projectsLoading, value.polling.projects], [false, []]);
  await act(() => value.rescan.rescan());
  assert.equal(hook.current().rescan.rescanning, false);
  await assert.rejects(value.mutations.handleCreate(INPUT), /Runner desktop connection required/);
  assert.equal(await act(() => hook.current().start.start()), false);
  assert.equal(hook.current().start.error, 'Tovu desktop connection required to start a website.');
  assert.equal(hook.current().transport.transport, undefined);
  assert.deepEqual(hook.current().conversations.conversations, []);
  assert.equal(hook.current().load.failed, false);
  assert.deepEqual(calls, []);
});

test('workspace chat uses preload for run commands and file staging, and releases its listener on unmount', async (t) => {
  const listeners = new Set<(message: WorkspaceChatEventMessage) => void>();
  const stops: { runId: string }[] = [];
  const uploads: { name: string; bytes: number[] }[] = [];
  const bridge = {
    onChatEvent: ({ listener }) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    chatStop: async (input) => { stops.push(input); },
    saveChatAttachment: async ({ name, data }) => {
      uploads.push({ name, bytes: Array.from(new Uint8Array(data)) });
      return { path: '/chat/staged/agenda.txt' };
    },
  } satisfies Pick<RunnerInventoryBridge, 'onChatEvent' | 'chatStop' | 'saveChatAttachment'>;
  Object.defineProperty(window, 'tovuRunner', { configurable: true, value: bridge });
  t.after(() => Reflect.deleteProperty(window, 'tovuRunner'));

  const hook = renderHook(t, () => useWorkspaceChatTransport());
  const { transport, uploadAttachments } = hook.current();
  assert.equal(listeners.size, 1);
  assert.ok(transport && uploadAttachments, 'the installed preload makes runs and uploads available');
  await transport.stopRun('run-84');
  assert.deepEqual(stops, [{ runId: 'run-84' }]);
  assert.deepEqual(await uploadAttachments([new File(['abc'], 'agenda.txt', { type: 'text/plain' })]), [
    { path: '/chat/staged/agenda.txt', name: 'agenda.txt', kind: 'file', size: 3, order: 0 },
  ]);
  assert.deepEqual(uploads, [{ name: 'agenda.txt', bytes: [97, 98, 99] }]);
  hook.rerender();
  assert.equal(hook.current().transport, transport);
  assert.equal(listeners.size, 1);
  hook.unmount();
  assert.equal(listeners.size, 0);
});
