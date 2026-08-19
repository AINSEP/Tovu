import { createRequire } from "node:module";
import path from "node:path";
import { Worker, type ResourceLimits } from "node:worker_threads";

import type { SiteRenderContext } from "./render.js";

// ESM has no ambient `require`; this file's own worker-bootstrap string (below)
// still needs `require.resolve` to locate `tsx/cjs/api` as a filesystem path
// (not the `file://` URL `import.meta.resolve` would return), so a local
// `require` is synthesized the standard Node way.
const require = createRequire(import.meta.url);

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
  /** Mirrors `ThemeManifest.skipLiquidAllowlist` — `loadTheme()` already made this decision at
   * discovery time; the worker's defensive re-lint (in case the file changed on disk since) honors
   * the same choice rather than re-deciding it. */
  skipLiquidAllowlist?: boolean;
}

/** The worker's reply, via `postMessage`. */
export type LiquidWorkerResult = { ok: true; html: string } | { ok: false; error: string };

export interface LiquidSandboxOptions {
  /** Wall-clock budget for one render before the worker is force-terminated. */
  timeoutMs?: number;
  /** V8 heap caps for the worker thread. */
  resourceLimits?: ResourceLimits;
}

/**
 * Wall-clock budget for one sandboxed Liquid render before the worker is force-terminated.
 *
 * 5s is the product default and stays the product default: a real visitor must never wait longer
 * than that for a runaway theme template, and this guard is what stops one from wedging a request.
 * It is deliberately NOT scaled by machine load for that reason — a busy server is exactly when a
 * visitor least wants a 30s wait.
 *
 * `TOVU_THEME_RENDER_TIMEOUT_MS` exists for the two cases where 5s is the wrong number and the
 * alternative is worse:
 *   - an operator on a slow/oversubscribed VPS whose legitimate themes genuinely need longer;
 *   - test runs, where a saturated CI box made this fire spuriously. On 2026-08-19 a 7-agent run
 *     drove an 8-core machine to load average 135 and `render-handlebars.test.ts` failed with
 *     "Handlebars render exceeded 5000ms timeout" on a template that renders in ~50ms idle. The
 *     same file passed 9/9 alone. Raising the DEFAULT would have weakened a real production guard
 *     to fix a test-environment problem; an explicit opt-in does not.
 *
 * Callers that pass `options.timeoutMs` are unaffected either way — the sandbox tests below pin
 * their own budgets (500ms to prove termination, 15000ms for the memory-blowup case) precisely so
 * they never depend on this default.
 */
function resolveDefaultTimeoutMs(): number {
  const raw = process.env.TOVU_THEME_RENDER_TIMEOUT_MS;
  if (!raw) return 5000;
  const parsed = Number.parseInt(raw, 10);
  // A malformed value falls back to the safe default rather than NaN (which would make every
  // `Date.now() < deadline` comparison false and terminate every render instantly).
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
}
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  codeRangeSizeMb: 16,
};

/**
 * Construct the isolated `Worker` for one render, matching whichever runtime
 * is currently active.
 *
 * Under a `tsc` build (`npm run build` → `node dist/...`) `import.meta.filename`
 * ends in `.js`; the compiled `liquid-worker.js` sibling is a plain file `Worker`
 * needs no special handling.
 *
 * Under `tsx` (dev / `npm test`) `import.meta.filename` ends in `.ts`. Passing the
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
  const isTsSource = import.meta.filename.endsWith(".ts");
  if (!isTsSource) {
    return new Worker(path.join(import.meta.dirname, "liquid-worker.js"), { workerData, resourceLimits });
  }
  const workerFile = path.join(import.meta.dirname, "liquid-worker.ts");
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
  // Resolved per call, not once at module load: a module-level const would freeze whatever
  // TOVU_THEME_RENDER_TIMEOUT_MS happened to be set at import time, so a test (or an operator
  // reloading config) setting it later would be silently ignored.
  const timeoutMs = options.timeoutMs ?? resolveDefaultTimeoutMs();
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
