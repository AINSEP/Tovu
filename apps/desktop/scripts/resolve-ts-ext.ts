/**
 * `--import` hook for the bare-node test pass: a relative `./x.js` that does not exist resolves to
 * `./x.ts`.
 *
 * The contracts and the website sources write their relative imports as `.js` (the preload build
 * emits them, and the website follows NodeNext), but the main-process tests run on bare node's type
 * stripping, which never maps `.js` to `.ts`. Without this, any main test that loads such a module
 * (contracts/workspace-chat.ts -> ./sections.js, website sites-home.ts -> ./sites-project-references.js)
 * dies with ERR_MODULE_NOT_FOUND before a single assertion runs. The other way out, running those
 * tests under tsx, corrupts the lcov counters (see TEST_PASSES in src/coverage-floors.ts).
 *
 * Only a failed resolve is retried, so every specifier that already resolves is untouched.
 */
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const retry = (error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" && /^\.\.?\//.test(specifier) && specifier.endsWith(".js");
      if (!retry) throw error;
      return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    }
  },
});
