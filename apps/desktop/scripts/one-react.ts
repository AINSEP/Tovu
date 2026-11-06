/**
 * `--import` hook for the tsx test pass: `react` and `react-dom` always resolve from this package.
 *
 * With Jini linked (`npm run link:jini`), node follows the symlink to the checkout's real path, so
 * Jini's own `import "react"` finds that checkout's copy while the renderer finds this repo's. The
 * renderer's first Jini hook then runs against a React that react-dom never set up, and every render
 * throws "Invalid hook call". The Vite build has no such split (`resolve.dedupe` in vite.config.mts),
 * and neither has a registry install, where `@jini-ai/*` declare React as a peer: both load one copy,
 * so this hook changes nothing there. Plain node has no dedupe option, hence this hook.
 */
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const fromHere = createRequire(new URL("../package.json", import.meta.url));

// Resolve before installing the hook: Node 24 also hooks createRequire().resolve().
const targets = new Map<string, string>();
for (const name of ["react", "react-dom"]) {
  const { exports } = fromHere(`${name}/package.json`) as { exports: Record<string, unknown> };
  for (const entry of Object.keys(exports)) {
    const specifier = entry === "." ? name : `${name}${entry.slice(1)}`;
    targets.set(specifier, pathToFileURL(fromHere.resolve(specifier)).href);
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const target = targets.get(specifier);
    if (!target) return nextResolve(specifier, context);
    // A finished URL rather than a changed `parentURL`: `require` ignores `parentURL`.
    return { url: target, shortCircuit: true };
  },
});
