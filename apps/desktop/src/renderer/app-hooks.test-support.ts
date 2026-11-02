/**
 * @file Test support for the hook families split out of `App.hooks.ts`: render a hook from its REAL
 * module under the one jsdom `dom-hook-harness.ts` installs, optionally with markup built from the
 * hook's own result (a ref that must land on a real element), plus the small fixtures those tests
 * share. Not a test file itself — the `*.test.ts` glob does not pick it up.
 */
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { installDom, type RenderedHook } from './dom-hook-harness.js';
import type { SiteRecord } from '../contracts/project.js';

/** The slice of node:test's context these helpers need. */
export type TestContext = { after: (fn: () => void) => void };

/**
 * Render `useHook` into its own root; `view` turns the hook's latest value into the markup rendered
 * alongside it (so a returned ref can attach to a real element).
 * @param t the test context, so the root is unmounted when the test ends.
 */
export function renderHookWithView<T>(
  t: TestContext,
  useHook: () => T,
  view: (value: T) => ReactNode = () => null,
): RenderedHook<T> {
  const window = installDom();
  let latest!: T;
  function Probe() { latest = useHook(); return view(latest); }
  const root = createRoot(window.document.body.appendChild(window.document.createElement('div')));
  let mounted = true;
  const unmount = () => { if (mounted) { mounted = false; act(() => root.unmount()); } };
  t.after(unmount);
  act(() => root.render(createElement(Probe)));
  return { current: () => latest, rerender: () => act(() => root.render(createElement(Probe))), unmount };
}

/** Let several rounds of pending promise callbacks, and the React updates they schedule, run. */
export async function settle(): Promise<void> {
  await act(async () => { for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve)); });
}

/** A promise whose settling the test controls. */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** A minimal `SiteRecord`: stopped, folder present, named after its id. */
export function site(id: string, fields: Partial<SiteRecord> = {}): SiteRecord {
  return { id, displayName: id, status: 'stopped', folderMissing: false, port: 0, ...fields } as SiteRecord;
}

/**
 * Wraps `target` (a fresh `EventTarget` unless given, e.g. the jsdom `document`) so its live
 * listeners are counted, typed as the `addEventListener`/`removeEventListener` slice a hook takes
 * as a port. `dispatch` fires an event on `target` with extra fields such as `key`.
 */
export function countingTarget<P>(
  target: EventTarget = new EventTarget(),
): { port: P; live: () => number; dispatch: (type: string, fields?: Record<string, unknown>) => void } {
  const listeners = new Set<unknown>();
  const port = {
    addEventListener(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) {
      listeners.add(listener);
      target.addEventListener(type, listener, options);
    },
    removeEventListener(type: string, listener: EventListener, options?: boolean | EventListenerOptions) {
      listeners.delete(listener);
      target.removeEventListener(type, listener, options);
    },
  };
  return {
    port: port as unknown as P,
    live: () => listeners.size,
    dispatch: (type, fields = {}) => { act(() => { target.dispatchEvent(Object.assign(new Event(type), fields)); }); },
  };
}
