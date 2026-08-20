import assert from "node:assert/strict";
import test from "node:test";

import type { SiteRenderContext } from "../render.js";
import { renderInWorkerSandbox } from "../worker-sandbox.js";

/**
 * @file Exercises `renderInWorkerSandbox`'s `worker.once("exit", ...)` branch directly, via a
 * test-only fixture worker (`__tests__/fixtures/exit-worker.ts`) that calls `process.exit()`
 * immediately.
 *
 * Neither real worker (`liquid-worker.ts`, `handlebars-worker.ts`) can reach this branch: both
 * route every failure — malformed workerData, a lint violation, a render exception — through a
 * try/catch into a `postMessage({ ok: false, ... })` reply, and any UNCAUGHT exception in a worker
 * thread fires Node's `error` event before `exit`. Verified empirically 2026-08-20: pointing
 * `renderInWorkerSandbox` at a nonexistent worker file (so the eval bootstrap's own `require()`
 * throws) rejects with the raw `Cannot find module ...` error, not this function's
 * "... worker exited with code ..." wrapper — proving `error` fires first and settles the promise
 * before `exit` gets a chance to. So the exit-message formatting below is real defensive code —
 * worth keeping in case some future worker (or a native-level crash) terminates without an `error`
 * event — but it is only reachable through this fixture, not through either production wrapper's
 * real templates.
 *
 * This does not duplicate the timeout-message assertions in `liquid-sandbox.test.ts` /
 * `handlebars-sandbox.test.ts`: those exercise the real per-engine call sites end to end and would
 * catch a future swap of the literal `"Liquid"`/`"Handlebars"` `errorLabel` argument between the two
 * one-line wrappers (both branches share that same parameter). This file instead proves the
 * exit-message TEMPLATE itself substitutes the label correctly, for either engine.
 */

test("a worker that exits without posting a message or throwing rejects with the exact exit-code message, per engine label", async () => {
  const input = { source: "irrelevant — the fixture exits before reading workerData", ctx: {} as unknown as SiteRenderContext };

  await assert.rejects(
    renderInWorkerSandbox("__tests__/fixtures/exit-worker", "Liquid", input, { timeoutMs: 3000 }),
    (err: Error) => {
      assert.equal(err.message, "Liquid render worker exited with code 7");
      return true;
    }
  );

  await assert.rejects(
    renderInWorkerSandbox("__tests__/fixtures/exit-worker", "Handlebars", input, { timeoutMs: 3000 }),
    (err: Error) => {
      assert.equal(err.message, "Handlebars render worker exited with code 7");
      return true;
    }
  );
});
