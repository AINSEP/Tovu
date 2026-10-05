/**
 * TypeScript bootstrap for the Tier-2 plugin worker, used ONLY when the server itself runs from
 * `.ts` sources (tsx dev / tests); a compiled build spawns `worker.js` with no bootstrap at all.
 *
 * `@jini-ai/sandbox/node-worker`'s `typescriptBootstrap` requires this module and calls
 * `register()` before requiring the worker entry. Its usual target, `tsx/cjs/api`, hooks only
 * `require()`: the plugin itself is loaded with a dynamic `import()`, which then falls through to
 * Node's native type stripping and cannot resolve a `./helper.js` specifier to `helper.ts`
 * (measured on Node v24.2.0). Registering tsx's ESM hooks too, inside the worker, fixes that.
 * Main-thread hooks (`node --import tsx`, `module.register()`) do NOT reach a worker spawned with
 * `execArgv: []`, so this cannot be done once in the parent.
 */
"use strict";

exports.register = function register() {
  require("tsx/cjs/api").register();
  require("tsx/esm/api").register();
};
