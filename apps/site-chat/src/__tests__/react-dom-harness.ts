import { createRequire, registerHooks } from 'node:module';
import { after } from 'node:test';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const DOM_GLOBAL_KEYS = [
  'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event',
  // The session-store adapter reads the browser global; each test needs its own transcript.
  'sessionStorage',
  'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'getComputedStyle',
  'addEventListener', 'removeEventListener',
  'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT',
] as const;

/** Install an isolated DOM and restore original descriptors, including Node's navigator getter.
 * No event shims: React DOM must detect jsdom's native input events when it loads.
 * @complexity Time/space: O(k) for the fixed set of installed globals, plus jsdom construction.
 */
export function installDom(
  { html = '<!doctype html><html><body><div id="root"></div></body></html>' } = {},
  { url = 'http://localhost/' } = {},
) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  const saved = DOM_GLOBAL_KEYS.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const view = dom.window as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBAL_KEYS) {
    let value = key === 'IS_REACT_ACT_ENVIRONMENT' ? true : view[key];
    // Browser globals share Window's event target; preserve real resize delivery and cleanup.
    if ((key === 'addEventListener' || key === 'removeEventListener') && typeof value === 'function') {
      value = value.bind(dom.window);
    }
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value });
  }
  return { dom, restore: () => {
    DOM_GLOBAL_KEYS.forEach((key, index) => {
      const descriptor = saved[index];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    });
    dom.window.close();
  } };
}

// Like Vite dedupe in rr3b: linked Jini packages and CommonJS dependencies must use
// the renderer's React. Synchronous Node hooks cover both import and require.
const hostRequire = createRequire(import.meta.url);
// Resolve before registering: calling require.resolve inside its own hook would recurse.
const reactEntries = new Map([
  'react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react/compiler-runtime',
  'react-dom', 'react-dom/client', 'react-dom/server', 'react-dom/test-utils',
].map(specifier => [specifier, pathToFileURL(hostRequire.resolve(specifier)).href]));
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(reactEntries.get(specifier) ?? specifier, context);
  },
});

// React DOM caches DOM/input-event support at module evaluation. Install globals
// before importing it, then let each test install and restore its own document.
const bootstrap = installDom();
export const React = await import('react');
export const { act } = React;
export const { createRoot } = await import('react-dom/client');
after(() => {
  hooks.deregister();
  bootstrap.restore();
});
