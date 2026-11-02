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
  useWebviewLoadFailure,
  useWorkspaceChatTransport,
} from './App.hooks.js';

// Installed up front: the first assertion below reads the jsdom `window` before any render.
const window = installDom();

const INPUT: CreateSiteInput = { displayName: 'new', database: { kind: 'sqlite' } };

// ── the default bridge lookup ───────────────────────────────────────────────────────────────────

test('with the default lookup and no preload (`window.tovuRunner` unset) every bridge-reading hook stays inert', async (t) => {
  assert.equal((window as { tovuRunner?: unknown }).tovuRunner, undefined);
  const calls: string[] = [];
  const hook = renderHook(t, () => {
    const polling = useSitesPolling();
    const rescan = useSiteRescan(polling.setProjects);
    const tabs = useProjectTabs();
    const nav = useSectionNav(tabs.setActiveTab);
    useRunnerNavigation(nav.setActiveId, tabs.setActiveTab);
    const mutations = useProjectMutations({
      setProjects: polling.setProjects, closeProjectTab: () => calls.push('close'),
      stopCreating: () => calls.push('stop'), startCreating: () => calls.push('start'),
    });
    const start = useSiteStart(site('a'));
    const load = useWebviewLoadFailure(0);
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
