import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

/** Repo-root `content/themes/<tree>/<id>/scripts/theme-toggle.js`, read as shipped. */
export function themeToggleScriptPath({ tree, themeId }: { tree: 'static' | '__original-themes__/static'; themeId: string }, _optional = {}): string {
  return path.resolve(import.meta.dirname, '../../../../../../content/themes', tree, themeId, 'scripts/theme-toggle.js');
}

export interface ToggleRun { readonly reads: string[]; readonly writes: Array<[string, string]>; readonly store: Map<string, string>; }

/**
 * Runs the real shipped script in a fresh VM context with a fake DOM, fires DOM-ready, then one
 * click on the single fake toggle button. No timers run: `setInterval` is captured and never fired.
 */
export function runThemeToggle(
  { scriptPath, scriptSrc, seeded }: { scriptPath: string; scriptSrc: string | undefined; seeded: Record<string, string> },
  _optional = {},
): ToggleRun {
  const store = new Map(Object.entries(seeded));
  const reads: string[] = [];
  const writes: Array<[string, string]> = [];
  const attrs = new Map<string, string>();
  const readyCallbacks: Array<() => void> = [];
  const clickCallbacks: Array<() => void> = [];
  const button = { addEventListener: (_type: string, cb: () => void) => { clickCallbacks.push(cb); }, setAttribute: () => undefined };
  const document = {
    currentScript: scriptSrc === undefined ? null : { src: scriptSrc },
    documentElement: {
      setAttribute: (name: string, value: string) => { attrs.set(name, value); },
      removeAttribute: (name: string) => { attrs.delete(name); },
      getAttribute: (name: string) => attrs.get(name) ?? null,
    },
    addEventListener: (_type: string, cb: () => void) => { readyCallbacks.push(cb); },
    querySelectorAll: () => [button],
  };
  const localStorage = {
    getItem: (key: string) => { reads.push(key); return store.get(key) ?? null; },
    setItem: (key: string, value: string) => { writes.push([key, value]); store.set(key, value); },
  };
  runInNewContext(readFileSync(scriptPath, 'utf8'), { document, localStorage, setInterval: () => 0, Date });
  for (const ready of readyCallbacks) ready();
  for (const click of clickCallbacks) click();
  return { reads, writes, store };
}
