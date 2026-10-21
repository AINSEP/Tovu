/**
 * @file The shared jsdom host for `App.render.test.ts` and `App.start-panel.render.test.ts`: one
 * jsdom per test PROCESS (node --test gives each file its own), the CSS load hook, the host
 * stand-ins, the recording desktop bridge and `renderApp`. See `App.render.test.ts` for why each
 * piece is a stand-in rather than a module mock. Not a test file itself.
 */
import assert from 'node:assert/strict';
import type { TestContext as NodeTestContext } from 'node:test';
import { createRequire, registerHooks } from 'node:module';
import React, { act, createElement } from 'react';
import type { CreatedSiteRecord, SiteFolders, SiteRecord } from '../contracts/project.js';
import type { RunnerSectionId } from '../contracts/sections.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import type { SiteFoldersSettings } from './use-site-folders.hooks.js';
import { useSiteStorageSettings } from './use-site-storage-settings.hooks.js';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    return nextLoad(url, context);
  },
});

const { JSDOM } = createRequire(import.meta.url)('jsdom');
export const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true });
const resizeCallbacks = new Set<() => void>();
class RecordingResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe() { resizeCallbacks.add(this.callback); }
  disconnect() { resizeCallbacks.delete(this.callback); }
}
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
  requestAnimationFrame: dom.window.requestAnimationFrame, cancelAnimationFrame: dom.window.cancelAnimationFrame,
  ResizeObserver: RecordingResizeObserver, IS_REACT_ACT_ENVIRONMENT: true,
  // `npm test` runs renderer tests under tsx's classic JSX transform (see `icons.test.ts`).
  React,
});
// Both loaded only now: react-dom decides at module load whether it has a DOM (and which input
// events it can use), so it must not be evaluated before the globals above exist.
const { createRoot } = await import('react-dom/client');
export const { App } = await import('./App.js');

export type TestContext = Pick<NodeTestContext, 'after'>;

export function site(id: string, fields: Partial<SiteRecord> = {}): SiteRecord {
  return {
    id, slug: id, displayName: `Site ${id}`, installDir: `/sites/${id}`, port: 0, partition: `persist:${id}`, templateId: 'starter',
    templateVersion: null, database: { kind: 'sqlite' }, desiredState: 'stopped', status: 'stopped', statusDetail: null,
    deleteErasesFiles: false, previewVersion: null, folderMissing: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...fields,
  } as SiteRecord;
}

/** The preload bridge: inert defaults plus listeners the test can fire, overridable per test. */
function installBridge(overrides: Partial<RunnerInventoryBridge> = {}) {
  const listeners = { navigate: new Set<(section: RunnerSectionId) => void>(), find: new Set<() => void>() };
  const calls: string[] = [];
  const bridge = {
    getAppVersion: async () => '1.2.3',
    listAgents: async () => [], rescanAgents: async () => [], daemonOnline: async () => true,
    listSites: async () => [], rescanSites: async () => { calls.push('rescan'); return []; },
    addSite: async () => { calls.push('add'); return null; },
    createSite: async () => null, renameSite: async (input: { id: string }) => site(input.id),
    getSitePreview: async () => null, locateSite: async (id: string) => site(id),
    startSite: async (id: string) => { calls.push(`start:${id}`); return site(id, { status: 'running', port: 4100 }); },
    stopSite: async (id: string) => site(id), deleteSite: async () => {},
    openSiteExternal: async (input: { siteId: string; view: string }) => { calls.push(`external:${input.siteId}:${input.view}`); },
    chatStart: async () => { throw new Error('unused'); }, chatReattach: async () => {}, chatDetach: async () => {}, chatStop: async () => {}, chatStatus: async () => null,
    saveChatAttachment: async () => { throw new Error('unused'); },
    listConversations: async () => [], createConversation: async () => { throw new Error('unused'); },
    renameConversation: async () => {}, deleteConversation: async () => {}, loadConversationMessages: async () => [], saveConversationMessage: async () => {},
    onChatEvent: () => () => {},
    onNavigate: (listener: (section: RunnerSectionId) => void) => { listeners.navigate.add(listener); return () => listeners.navigate.delete(listener); },
    onSiteHistory: () => () => {},
    onFindToggle: (listener: () => void) => { listeners.find.add(listener); return () => listeners.find.delete(listener); },
    findInPage: async () => { calls.push('find'); }, stopFindInPage: async () => { calls.push('stop-find'); }, onFindResult: () => () => {},
    onZoomCommand: () => () => {}, getZoomLevel: () => 0, setZoomLevel: () => {},
    getPathForFile: () => '', pickWorkingDirectory: async () => null, recentWorkingDirectories: async () => [],
    workingDirectoryExists: async () => true, normalizeWorkingDirectory: async (directory: string) => directory,
    ...overrides,
  } as RunnerInventoryBridge;
  dom.window.tovuRunner = bridge;
  return { bridge, listeners, calls };
}

const FOLDERS: SiteFolders = { roots: [], extraRoots: [] } as unknown as SiteFolders;
function useFakeFolders(): SiteFoldersSettings {
  return { folders: FOLDERS, busy: false, error: null, clearError() {}, addFolder: async () => {}, setHome: async () => {}, saveSettings: async () => {}, removeFolder: async () => {} };
}

export const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise<void>((resolve) => setImmediate(resolve)); });

export async function renderApp(t: TestContext, overrides: Partial<RunnerInventoryBridge> = {}) {
  const host = installBridge(overrides);
  let settingsShown = 0;
  const useSiteSettings: typeof useSiteStorageSettings = (required, options) => ({
    ...useSiteStorageSettings(required, { ...options, useFolders: useFakeFolders }),
    show: () => { settingsShown++; },
  });
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  t.after(() => { act(() => root.unmount()); container.remove(); });
  const props: NonNullable<Parameters<typeof App>[0]> = { sitesSettings: { useFolders: useFakeFolders, useSiteSettings } };
  // `App`'s whole props object is optional (production calls `<App />`), which `createElement`'s
  // overloads cannot infer through; the cast only restates that signature with props required.
  act(() => root.render(createElement(App as (required: typeof props) => ReturnType<typeof App>, props)));
  await settle();
  const all = (selector: string) => [...container.querySelectorAll<HTMLElement>(selector)];
  const byText = (text: string, selector = 'button') => all(selector).find((el) => el.textContent?.trim() === text);
  const byLabel = (label: string) => container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  const click = async (el: Element | null | undefined) => {
    assert.ok(el, 'element to click is on screen');
    await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    await settle();
  };
  const key = (el: Element, init: Record<string, unknown>) => act(() => { el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, ...init })); });
  return { ...host, container, all, byText, byLabel, click, key, text: () => container.textContent ?? '', settingsShown: () => settingsShown };
}

/** Opens the first card of the grid as a tab. */
export async function openFirstSite(app: Awaited<ReturnType<typeof renderApp>>) {
  await app.click(app.container.querySelector('article.card'));
}
export { act };

/** Closes the shared window, ending its timers and animation-frame clock. */
export function closeHost(): void {
  dom.window.close();
}
