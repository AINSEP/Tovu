import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { mock } from "node:test";

/**
 * @file `typescript-bootstrap.cjs` normally runs only inside a Tier-2 worker thread (spawned by
 * `run-in-worker.ts` through `@jini-ai/sandbox/node-worker`), where the main process's coverage
 * cannot see it. Loaded here in-process with its two tsx dependencies replaced, which pins the one
 * contract that matters: `register()` installs tsx's CJS hook AND its ESM hook — the ESM one being
 * the whole reason this file exists (a plugin is loaded with a dynamic `import()`, which the CJS
 * hook alone does not reach).
 */
test("register() installs tsx's CJS require hook and then its ESM import hook, once each", async () => {
  const calls: string[] = [];
  mock.module("tsx/cjs/api", { namedExports: { register: () => { calls.push("cjs"); } } });
  mock.module("tsx/esm/api", { namedExports: { register: () => { calls.push("esm"); } } });
  const require = createRequire(import.meta.url);
  const bootstrap = require("../typescript-bootstrap.cjs") as { register: () => void };

  assert.deepEqual(Object.keys(bootstrap), ["register"]);
  bootstrap.register();
  assert.deepEqual(calls, ["cjs", "esm"]);
});
