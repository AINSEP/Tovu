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

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!/^react(-dom)?(\/|$)/.test(specifier)) return nextResolve(specifier, context);
    // A finished URL rather than a changed `parentURL`: `require` ignores `parentURL`.
    return { url: pathToFileURL(fromHere.resolve(specifier)).href, shortCircuit: true };
  },
});
