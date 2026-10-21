/**
 * @file Test support: render a renderer hook from its REAL module under one jsdom, so the coverage
 * gate attributes the run to the hook's file. `sourceFunction` (source-test-harness.ts) evaluates a
 * hook's source text instead, which lcov cannot attribute to the file at all.
 *
 * Same shape as the local `renderHook` in `imported-hooks.hooks.test.ts`, shared here because the
 * per-hook render tests (`*.hooks.render.test.ts`) all need it. node --test runs each test file in
 * its own process, so the one jsdom installed per process never leaks between files.
 */
import { createRequire } from 'node:module';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

type JsdomWindow = Window & typeof globalThis;

let installed: JsdomWindow | null = null;

/**
 * Install (once per process) a jsdom `window`/`document` as globals and return its window.
 * @param url the document URL, applied only on the first install.
 */
export function installDom({ url = 'http://localhost/' }: { url?: string } = {}): JsdomWindow {
  if (installed !== null) return installed;
  const { JSDOM } = createRequire(import.meta.url)('jsdom');
  const dom = new JSDOM('<!doctype html><body></body>', { url, pretendToBeVisual: true });
  installed = dom.window as JsdomWindow;
  Object.assign(globalThis, { window: installed, document: installed.document, IS_REACT_ACT_ENVIRONMENT: true });
  return installed;
}

/** What {@link renderHook} hands back: the latest hook value, a rerender and an idempotent unmount. */
export interface RenderedHook<T> {
  current: () => T;
  rerender: () => void;
  unmount: () => void;
}

/**
 * Render `useHook` into its own root; `current()` is the value from the latest render.
 * @param t the test context, so the root is unmounted when the test ends.
 */
export function renderHook<T>(t: { after: (fn: () => void) => void }, useHook: () => T): RenderedHook<T> {
  const window = installDom();
  let latest!: T;
  function Probe() { latest = useHook(); return null; }
  const root = createRoot(window.document.body.appendChild(window.document.createElement('div')));
  let mounted = true;
  const unmount = () => { if (mounted) { mounted = false; act(() => root.unmount()); } };
  t.after(unmount);
  act(() => root.render(createElement(Probe)));
  return { current: () => latest, rerender: () => act(() => root.render(createElement(Probe))), unmount };
}

/** Let pending promise callbacks and the React updates they schedule run. */
export async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); });
}
