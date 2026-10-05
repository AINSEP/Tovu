import { parentPort, workerData } from "node:worker_threads";

import { runHandlebarsRender } from "./handlebars-render.js";

/**
 * @file `worker_threads` entry point that actually compiles and runs Handlebars
 * (ADR-020 Tier 2, Handlebars tier). Never imported statically —
 * `handlebars-sandbox.ts` spawns it by file path via `new Worker(...)`, so this
 * module only ever executes inside an isolated worker thread, bounded by the
 * caller's timeout and `resourceLimits`. The counterpart of `liquid-worker.ts`.
 *
 * The environment construction, the `render_block` helper, hardening decisions 1-3 and the render
 * logic live in `handlebars-render.ts` (importable, so tests measure it in-process; its header
 * states all four hardening decisions and why). This entry refuses to run outside a worker,
 * applies hardening 4 below, and posts that module's result back to the parent.
 */

if (!parentPort) {
  throw new Error("handlebars-worker.ts must run inside a worker_threads Worker");
}

// Hardening 4 (see file header): drop the package's own `.hbs`/`.handlebars`
// `require()` hooks, which are the only `fs` touch anywhere in the Handlebars
// runtime. Guarded because `require.extensions` is absent under a pure-ESM
// entry point.
if (typeof require !== "undefined" && require.extensions) {
  delete require.extensions[".hbs"];
  delete require.extensions[".handlebars"];
}

parentPort.postMessage(runHandlebarsRender({ workerData }));
