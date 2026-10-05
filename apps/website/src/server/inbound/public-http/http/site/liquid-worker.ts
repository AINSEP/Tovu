import { parentPort, workerData } from "node:worker_threads";

import { runLiquidRender } from "./liquid-render.js";

/**
 * @file `worker_threads` entry point that actually runs LiquidJS
 * (ADR-020 Tier 2). Never imported statically — `liquid-sandbox.ts` spawns
 * it by file path via `new Worker(...)`, so this module only ever executes
 * inside an isolated worker thread, bounded by the caller's timeout and
 * `resourceLimits`.
 *
 * The engine construction, the `render_block` tag, the filesystem hardening and the render logic
 * live in `liquid-render.ts` (importable, so tests measure it in-process); this entry only refuses
 * to run outside a worker and posts that module's result back to the parent.
 */

if (!parentPort) {
  throw new Error("liquid-worker.ts must run inside a worker_threads Worker");
}

parentPort.postMessage(runLiquidRender({ workerData }));
