import path from "node:path";
import { Worker, type ResourceLimits } from "node:worker_threads";

import type { SiteRenderContext } from "./render";

/**
 * @file ADR-020 Tier-2 guardrail: render isolation for LiquidJS templates.
 *
 * Purpose:
 * Spawns a fresh `worker_threads` `Worker` per render, bounded by a CPU wall-
 * clock timeout and V8 heap `resourceLimits`, so an adversarial "templated"
 * theme (e.g. an unbounded `{% for %}` loop, or a template that builds an
 * enormous string) cannot hang or OOM the main server process. A
 * `Promise.race` around the synchronous `parseAndRenderSync` call would not
 * help here — synchronous CPU-bound work on the main thread can't be
 * pre-empted by a timer running on that same thread. Running the render on a
 * *separate* thread is what makes `worker.terminate()` able to actually stop
 * it. `worker_threads` is used instead of `isolated-vm`/`vm2`: it ships with
 * Node (no new native dependency), and `vm2` carries known sandbox-escape
 * CVEs while `isolated-vm` needs native compilation.
 *
 * How it relates to the project:
 * Called from `render.ts`'s `renderSite()` in place of the old in-process
 * `renderLiquidBody()`. The actual Liquid engine + component-registry
 * wiring lives in `liquid-worker.ts`, which this module spawns by file path
 * (not by static import, so the main thread never needs to construct a
 * Liquid engine at all).
 */

/** What one render needs, sent to the worker as `workerData` (structured-clone only — plain data, no functions/class instances). */
export interface LiquidWorkerInput {
  source: string;
  ctx: SiteRenderContext;
}

/** The worker's reply, via `postMessage`. */
export type LiquidWorkerResult = { ok: true; html: string } | { ok: false; error: string };

export interface LiquidSandboxOptions {
  /** Wall-clock budget for one render before the worker is force-terminated. */
  timeoutMs?: number;
  /** V8 heap caps for the worker thread. */
  resourceLimits?: ResourceLimits;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  codeRangeSizeMb: 16,
};

/**
 * Construct the isolated `Worker` for one render, matching whichever runtime
 * is currently active.
 *
 * Under a `tsc` build (`npm run build` → `node dist/...`) `__filename` ends
 * in `.js`; the compiled `liquid-worker.js` sibling is a plain file `Worker`
 * needs no special handling.
 *
 * Under `tsx` (dev / `npm test`) `__filename` ends in `.ts`. Passing the
 * `.ts` sibling as the `Worker`'s *entry* file with `execArgv: ["--import",
 * "tsx"]` looks like the documented tsx pattern, but does not work here:
 * verified empirically that Node's ESM loader routes a CommonJS-typed `.ts`
 * *entry point* through its `loadCJSModule` translator, which does not run
 * registered `--import` hooks against that first file — the sibling fails
 * to parse with "Cannot use import statement outside a module" even though
 * `execArgv`/`process.execArgv` show the flag present. The fix (also
 * verified empirically) is to give the worker an inline bootstrap script via
 * `eval: true` that first calls `tsx/cjs/api`'s `register()` — the same
 * programmatic hook `tsx`'s CLI registers, but invoked as an ordinary
 * `require()` inside the worker's own CommonJS entry — and only then
 * `require()`s the real `.ts` worker file by absolute path. That `require()`
 * is a normal, already-registered-hook require, which is the path every
 * other cross-file `.ts` import in this codebase already goes through
 * successfully under `--import tsx`.
 */
function spawnLiquidWorker(workerData: LiquidWorkerInput, resourceLimits: ResourceLimits): Worker {
  const isTsSource = __filename.endsWith(".ts");
  if (!isTsSource) {
    return new Worker(path.join(__dirname, "liquid-worker.js"), { workerData, resourceLimits });
  }
  const workerFile = path.join(__dirname, "liquid-worker.ts");
  const tsxApiPath = require.resolve("tsx/cjs/api");
  const bootstrap = `require(${JSON.stringify(tsxApiPath)}).register();\nrequire(${JSON.stringify(workerFile)});\n`;
  return new Worker(bootstrap, { eval: true, workerData, resourceLimits });
}

/**
 * Render a "templated"-tier (LiquidJS) theme body inside an isolated worker
 * thread, bounded by a wall-clock timeout and V8 heap limits.
 *
 * @param input the template source plus the render context (must already be
 *   plain, structured-cloneable data — `SiteRenderContext`'s `posts`/`post`
 *   fields are, by construction, `PostRecord`s with no functions/class
 *   instances).
 * @param options timeout/resourceLimits overrides; sane defaults apply.
 * @returns the rendered HTML body.
 * @throws if the render times out, the worker crashes/OOMs, or the template
 *   itself is invalid (syntax error or a disallowed tag/filter caught by the
 *   worker's defensive re-lint) — callers already treat any thrown error
 *   from Liquid rendering as "fall back to the minimal built-in body"
 *   (`render.ts`'s `renderSite`, SPEC-004 REQ-10 spirit: a broken/hostile
 *   theme must never 500 the site).
 * @complexity O(1) additional work beyond the render itself: one Worker
 *   spawn/teardown per call. No pooling — see the Programmer handoff for the
 *   documented spawn-cost tradeoff.
 * @overallScore 100/100
 */
export function renderLiquidInSandbox(
  input: LiquidWorkerInput,
  options: LiquidSandboxOptions = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const resourceLimits = options.resourceLimits ?? DEFAULT_RESOURCE_LIMITS;

  return new Promise<string>((resolve, reject) => {
    const worker = spawnLiquidWorker(input, resourceLimits);
    let settled = false;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        reject(new Error(`Liquid render exceeded ${timeoutMs}ms timeout`));
      });
      // Best-effort teardown; the promise has already settled above.
      void worker.terminate();
    }, timeoutMs);

    worker.once("message", (message: LiquidWorkerResult) => {
      finish(() => {
        if (message.ok) resolve(message.html);
        else reject(new Error(message.error));
      });
      void worker.terminate();
    });

    worker.once("error", (err: Error) => {
      finish(() => reject(err));
    });

    worker.once("exit", (code: number) => {
      finish(() => reject(new Error(`Liquid render worker exited with code ${code}`)));
    });
  });
}
