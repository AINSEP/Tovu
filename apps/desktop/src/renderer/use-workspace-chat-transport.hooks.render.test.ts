/**
 * @file `useWorkspaceChatTransport` rendered from its real module under jsdom with a full fake
 * bridge injected. Moved from `App.hooks.render.test.ts` with the split.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunnerInventoryBridge } from './runner-api.js';
import { renderHookWithView as renderHook } from './app-hooks.test-support.js';
import { useWorkspaceChatTransport } from './use-workspace-chat-transport.hooks.js';

/** A full bridge with inert defaults; tests override only what they exercise. */
function fakeBridge(overrides: Partial<RunnerInventoryBridge> = {}): RunnerInventoryBridge & { chatListeners: Set<unknown> } {
  const chatListeners = new Set<unknown>();
  const inert = async () => { throw new Error('not used by this test'); };
  return {
    chatListeners,
    listAgents: async () => [], rescanAgents: async () => [], daemonOnline: async () => true,
    listSites: async () => [], rescanSites: async () => [], addSite: inert, createSite: inert, renameSite: inert,
    getSitePreview: async () => null, locateSite: inert, startSite: inert, stopSite: inert, deleteSite: inert,
    openSiteExternal: inert, chatStart: inert, chatReattach: inert, chatDetach: async () => {}, chatStop: inert, chatStatus: async () => null,
    saveChatAttachment: async () => ({ path: '/staged/file.txt' }) as never,
    listConversations: async () => [], createConversation: inert, renameConversation: inert, deleteConversation: inert,
    loadConversationMessages: async () => [], saveConversationMessage: async () => {},
    onChatEvent: (listener) => { chatListeners.add(listener); return () => chatListeners.delete(listener); },
    onNavigate: () => () => {}, onSiteHistory: () => () => {}, onFindToggle: () => () => {},
    findInPage: async () => {}, stopFindInPage: async () => {}, onFindResult: () => () => {}, onZoomCommand: () => () => {},
    getZoomLevel: () => 0, setZoomLevel: () => {}, getPathForFile: () => '/picked/file.txt',
    pickWorkingDirectory: async () => null, recentWorkingDirectories: async () => [], workingDirectoryExists: async () => true,
    normalizeWorkingDirectory: async (directory) => directory,
    ...overrides,
  };
}

test('useWorkspaceChatTransport: wires every surface from one bridge, and disposing the pane drops its run listener', (t) => {
  const bridge = fakeBridge();
  const getBridge = () => bridge;
  const hook = renderHook(t, () => useWorkspaceChatTransport({}, { getBridge }));
  const value = hook.current();
  assert.deepEqual(value.runtimeAccess, { listAgents: bridge.listAgents, rescanAgents: bridge.rescanAgents, daemonOnline: bridge.daemonOnline });
  assert.deepEqual(value.workingDirectoryAccess, {
    normalizeWorkingDirectory: bridge.normalizeWorkingDirectory, pickWorkingDirectory: bridge.pickWorkingDirectory,
    recentDirectories: bridge.recentWorkingDirectories, directoryExists: bridge.workingDirectoryExists,
  });
  assert.equal(value.getPathForFile, bridge.getPathForFile);
  assert.equal(typeof value.uploadAttachments, 'function');
  assert.ok(value.transport);
  assert.equal(bridge.chatListeners.size, 1, 'one run-event listener per pane');
  hook.rerender();
  assert.equal(hook.current().transport, value.transport, 'the transport is not rebuilt per render');
  assert.equal(hook.current().runtimeAccess, value.runtimeAccess, 'nor are the access surfaces');
  assert.equal(bridge.chatListeners.size, 1);
  hook.unmount();
  assert.equal(bridge.chatListeners.size, 0);
});

test('useWorkspaceChatTransport: the bridge is looked up once per lookup, not once per render', (t) => {
  let lookups = 0;
  const bridge = fakeBridge();
  const getBridge = () => { lookups++; return bridge; };
  const hook = renderHook(t, () => useWorkspaceChatTransport({}, { getBridge }));
  hook.rerender();
  hook.rerender();
  assert.equal(lookups, 1);
});

test('useWorkspaceChatTransport: without a bridge every surface is absent', (t) => {
  const getBridge = () => undefined;
  const hook = renderHook(t, () => useWorkspaceChatTransport({}, { getBridge }));
  assert.deepEqual(hook.current(), { transport: undefined, runtimeAccess: undefined, workingDirectoryAccess: undefined, getPathForFile: undefined, uploadAttachments: undefined });
});
