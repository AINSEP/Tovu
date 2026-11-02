/**
 * @file Test support for `app/*.render.test.ts`: renders ONE shell component from its own module
 * into a real React root, so a test drives it with real DOM events and coverage lands on that
 * component's file rather than on `App.tsx`. The jsdom, its host stand-ins (`matchMedia`,
 * `ResizeObserver`, `scrollIntoView`) and the `.css` resolve hook all come from
 * `app-render-harness.ts` — one copy of each per test process — which also means react-dom loads
 * only after the DOM globals exist. Not a test file itself.
 */
import assert from 'node:assert/strict';
import { act, type ReactElement } from 'react';
// Before `react-dom/client`: ES imports evaluate in order, and react-dom reads the DOM globals this
// harness installs (whether it has a DOM, which input events exist) once, when it is evaluated.
import { dom, settle, site } from '../app-render-harness.js';
import { createRoot } from 'react-dom/client';
import type { RunnerInventoryBridge } from '../runner-api.js';
import type { SiteFolders } from '../../contracts/project.js';
import type { SiteFoldersSettings } from '../use-site-folders.hooks.js';
import { useSiteStorageSettings } from '../use-site-storage-settings.hooks.js';

export { act, dom, settle, site };

/** The slice of `node:test`'s context these helpers need. */
export interface TestContext {
  after: (fn: () => void) => void;
}

/** What {@link mount} hands back: the root's container, a re-render, and real-event helpers. */
export interface Mounted {
  container: HTMLElement;
  render: (next: ReactElement) => void;
  all: (selector: string) => HTMLElement[];
  byLabel: (label: string) => HTMLElement | null;
  byText: (text: string, selector?: string) => HTMLElement | undefined;
  text: () => string;
  click: (el: Element | null | undefined) => Promise<void>;
  type: (input: HTMLInputElement, value: string) => Promise<void>;
}

/**
 * Render `element` into its own root, unmounted when the test ends.
 * @param t the test context.
 * @param element the component under test, built with `createElement`.
 */
export function mount({ t, element }: { t: TestContext; element: ReactElement }, _options = {}): Mounted {
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  t.after(() => { act(() => root.unmount()); container.remove(); });
  const render = (next: ReactElement) => act(() => root.render(next));
  render(element);
  const all = (selector: string) => [...container.querySelectorAll<HTMLElement>(selector)];
  return {
    container,
    render,
    all,
    byLabel: (label) => container.querySelector<HTMLElement>(`[aria-label="${label}"]`),
    byText: (text, selector = 'button') => all(selector).find((el) => el.textContent?.trim() === text),
    text: () => container.textContent ?? '',
    async click(el) {
      assert.ok(el, 'element to click is on screen');
      await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
      await settle();
    },
    async type(input, value) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
    },
  };
}

/**
 * Put a desktop bridge on `window.tovuRunner` for one test — only the methods that test names; a
 * hook that finds a method missing takes its own no-bridge path — and restore the previous one after.
 */
export function installBridge({ t, bridge }: { t: TestContext; bridge: Partial<RunnerInventoryBridge> }, _options = {}): void {
  const previous = dom.window.tovuRunner;
  dom.window.tovuRunner = bridge as RunnerInventoryBridge;
  t.after(() => { dom.window.tovuRunner = previous; });
}

const FOLDERS = { roots: [], extraRoots: [] } as unknown as SiteFolders;

/** The Projects header's `SitesFolders` seam: settled, no folders, every action a no-op. */
export function useFakeFolders(): SiteFoldersSettings {
  return { folders: FOLDERS, busy: false, error: null, clearError() {}, addFolder: async () => {}, setHome: async () => {}, saveSettings: async () => {}, removeFolder: async () => {} };
}

/**
 * The Settings menu's "Sites settings…" seam: the desktop's real `useSiteStorageSettings` over
 * {@link useFakeFolders}, with `show` counted instead of opening Jini's dialog shell (see
 * `App.render.test.ts` on why that shell cannot render under this file's React).
 */
export function fakeSiteSettings(_input = {}, _options = {}): { useSiteSettings: typeof useSiteStorageSettings; shown: () => number } {
  let shown = 0;
  const useSiteSettings: typeof useSiteStorageSettings = (required, options) => ({
    ...useSiteStorageSettings(required, { ...options, useFolders: useFakeFolders }),
    show: () => { shown++; },
  });
  return { useSiteSettings, shown: () => shown };
}

/** Telemetry reports sent while a test runs, through the preload's `window.tovuTelemetry` seam. */
export function recordTelemetry({ t }: { t: TestContext }, _options = {}): unknown[] {
  const previous = dom.window.tovuTelemetry;
  const payloads: unknown[] = [];
  dom.window.tovuTelemetry = { report: (payload: unknown) => { payloads.push(payload); } };
  t.after(() => { dom.window.tovuTelemetry = previous; });
  return payloads;
}
