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
 * @file ADR-020 Tier-2 guardrail: shared render-isolation machinery for the "templated" (LiquidJS)
 * and Handlebars logic tiers.
 *
 * Purpose:
 * Spawns a fresh `worker_threads` `Worker` per render, bounded by a CPU wall-clock timeout and V8
 * heap `resourceLimits`, so an adversarial "templated" or Handlebars theme (e.g. an unbounded loop,
 * or a template that builds an enormous string) cannot hang or OOM the main server process. A
 * `Promise.race` around a synchronous render call would not help here — synchronous CPU-bound work
 * on the main thread can't be pre-empted by a timer running on that same thread. Running the render
 * on a *separate* thread is what makes `worker.terminate()` able to actually stop it.
 * `worker_threads` is used instead of `isolated-vm`/`vm2`: it ships with Node (no new native
 * dependency), and `vm2` carries known sandbox-escape CVEs while `isolated-vm` needs native
 * compilation.
 *
 * Extracted from `liquid-sandbox.ts` and `handlebars-sandbox.ts` (2026-08-20): both engines needed
 * this identical spawn-per-render / timeout / resourceLimits machinery, and carrying it as two
 * independently-maintained copies had already drifted once — the `resolveDefaultTimeoutMs` doc
 * comment below used to be duplicated verbatim in both files, and the copy inside `liquid-sandbox.ts`
 * cited `render-handlebars.test.ts` (the wrong engine's test file) for its incident writeup. One
 * shared copy is what makes that class of error structurally impossible going forward — see
 * `ADS-memory/reports/architecture/2026-08-20-worker-sandbox-extraction-proposal.md`.
 *
 * `liquid-sandbox.ts` and `handlebars-sandbox.ts` each keep their own `@file` header (per-engine
 * threat model), their own input/result type names (so `liquid-worker.ts`/`handlebars-worker.ts`
 * need no import changes), and their own one-line `render*InSandbox` wrapper naming their worker
 * file and engine label — this module owns only the mechanical part neither engine's semantics
 * actually depend on.
 */

/** The plain, structured-cloneable `workerData` shape both engine workers accept. Each engine's own
 * `*WorkerInput` type `extends` this with whatever it needs beyond `source`/`ctx` (e.g. Liquid's
 * `skipLiquidAllowlist`, which Handlebars has no equivalent of). */
export interface SandboxRenderInput {
  source: string;
  ctx: SiteRenderContext;
}

/** The worker's reply, via `postMessage` — identical shape for both engines. */
export type SandboxRenderResult = { ok: true; html: string } | { ok: false; error: string };

export interface SandboxOptions {
  /** Wall-clock budget for one render before the worker is force-terminated. */
  timeoutMs?: number;
  /** V8 heap caps for the worker thread. */
  resourceLimits?: ResourceLimits;
}

const DEFAULT_RENDER_TIMEOUT_MS = 5000;
const MAX_RENDER_TIMEOUT_MS = 300_000;

/**
 * Wall-clock budget for one sandboxed render before the worker is force-terminated. Shared by both
 * the Liquid and Handlebars tiers — `liquid-sandbox.ts` and `handlebars-sandbox.ts` both
 * `export { resolveDefaultTimeoutMs } from "./worker-sandbox.js"` rather than each defining their
 * own; `sandbox-timeout-resolution.test.ts` asserts that stays true.
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
 *     "Handlebars render exceeded 5000ms timeout" on a template that renders in ~50ms idle; the
 *     same file passed 9/9 alone. Raising the DEFAULT would have weakened a real production guard
 *     to fix a test-environment problem; an explicit opt-in does not. (This resolver is shared by
 *     both engines — the same CI-saturation phenomenon could equally have hit
 *     `liquid-sandbox.test.ts`'s own timeout case; `render-handlebars.test.ts` is simply the one
 *     that actually did.)
 *
 * Callers that pass `options.timeoutMs` are unaffected either way — the sandbox tests pin their own
 * budgets (500ms to prove termination, 15000ms for the memory-blowup case) precisely so they never
 * depend on this default.
 */
export function resolveDefaultTimeoutMs(): number {
  const raw = process.env.TOVU_THEME_RENDER_TIMEOUT_MS;
  if (!raw) return DEFAULT_RENDER_TIMEOUT_MS;
  // STRICT digits-only, deliberately not `Number.parseInt`: parseInt stops at the first non-digit and
  // silently accepts a malformed prefix, which is worse than rejecting it. Measured 2026-08-19 during
  // an adversarial audit of this very function: `"5e3"` -> 5 (a 5 MILLISECOND budget, so every render
  // on the site fails) and `"1e10"` -> 1; `"60000ms"` -> 60000, quietly bypassing the fallback the
  // comment claimed to provide. A typo in an operator's env var must degrade to the safe default, not
  // to a value that looks deliberate.
  if (!/^\d+$/.test(raw.trim())) return DEFAULT_RENDER_TIMEOUT_MS;
  const parsed = Number(raw.trim());
  // Upper bound as well as lower: this guard exists to stop a runaway template wedging a request, so
  // an absurd budget defeats its purpose as surely as a zero one. 5 minutes is far past any legitimate
  // slow-VPS render and still finite.
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_RENDER_TIMEOUT_MS) return DEFAULT_RENDER_TIMEOUT_MS;
  return parsed;
}

const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  codeRangeSizeMb: 16,
};

/**
 * Construct the isolated `Worker` for one render, matching whichever runtime is currently active.
 *
 * Under a `tsc` build (`npm run build` → `node dist/...`) `import.meta.filename` ends in `.js`; the
 * compiled worker file sibling is a plain file `Worker` needs no special handling.
 *
 * Under `tsx` (dev / `npm test`) `import.meta.filename` ends in `.ts`. Passing the `.ts` sibling as
 * the `Worker`'s *entry* file with `execArgv: ["--import", "tsx"]` looks like the documented tsx
 * pattern, but does not work here: verified empirically that Node's ESM loader routes a
 * CommonJS-typed `.ts` *entry point* through its `loadCJSModule` translator, which does not run
 * registered `--import` hooks against that first file — the sibling fails to parse with "Cannot use
 * import statement outside a module" even though `execArgv`/`process.execArgv` show the flag
 * present. The fix (also verified empirically) is to give the worker an inline bootstrap script via
 * `eval: true` that first calls `tsx/cjs/api`'s `register()` — the same programmatic hook `tsx`'s CLI
 * registers, but invoked as an ordinary `require()` inside the worker's own CommonJS entry — and only
 * then `require()`s the real `.ts` worker file by absolute path. That `require()` is a normal,
 * already-registered-hook require, which is the path every other cross-file `.ts` import in this
 * codebase already goes through successfully under `--import tsx`.
 */
function spawnSandboxWorker(workerBasename: string, workerData: SandboxRenderInput, resourceLimits: ResourceLimits): Worker {
  const isTsSource = import.meta.filename.endsWith(".ts");
  if (!isTsSource) {
    return new Worker(path.join(import.meta.dirname, `${workerBasename}.js`), { workerData, resourceLimits });
  }
  const workerFile = path.join(import.meta.dirname, `${workerBasename}.ts`);
  const tsxApiPath = require.resolve("tsx/cjs/api");
  const bootstrap = `require(${JSON.stringify(tsxApiPath)}).register();\nrequire(${JSON.stringify(workerFile)});\n`;
  return new Worker(bootstrap, { eval: true, workerData, resourceLimits });
}

/**
 * Render a theme body inside an isolated worker thread, bounded by a wall-clock timeout and V8 heap
 * limits. Shared run loop for both the Liquid and Handlebars tiers — `renderLiquidInSandbox` and
 * `renderHandlebarsInSandbox` are one-line callers naming their own worker file and engine label.
 *
 * @param workerBasename the sibling worker file to spawn, without extension (e.g. `"liquid-worker"`,
 *   `"handlebars-worker"`) — resolved relative to THIS module's directory, so the named worker file
 *   must live beside `worker-sandbox.ts`.
 * @param errorLabel the engine name used in thrown error text (`"Liquid"` / `"Handlebars"`), so a
 *   render failure's message still carries the same engine identity a caller or an operator reading
 *   logs would see before this extraction.
 * @param input the template source plus the render context (must already be plain,
 *   structured-cloneable data — `SiteRenderContext`'s `posts`/`post` fields are, by construction,
 *   `PostRecord`s with no functions/class instances).
 * @param options timeout/resourceLimits overrides; sane defaults apply.
 * @returns the rendered HTML body.
 * @throws if the render times out, the worker crashes/OOMs, or the template itself is invalid
 *   (syntax error, or a disallowed construct caught by the worker's defensive re-lint) — callers
 *   already treat any thrown error from a logic-tier render as "fall back to the minimal built-in
 *   body" (`render.ts`'s `renderSite`, SPEC-004 REQ-10 spirit: a broken/hostile theme must never 500
 *   the site).
 * @complexity O(1) additional work beyond the render itself: one Worker spawn/teardown per call. No
 *   pooling — see the Programmer handoff for the documented spawn-cost tradeoff.
 */
export function renderInWorkerSandbox(
  workerBasename: string,
  errorLabel: string,
  input: SandboxRenderInput,
  options: SandboxOptions = {}
): Promise<string> {
  // Resolved per call, not once at module load: a module-level const would freeze whatever
  // TOVU_THEME_RENDER_TIMEOUT_MS happened to be set at import time, so a test (or an operator
  // reloading config) setting it later would be silently ignored.
  const timeoutMs = options.timeoutMs ?? resolveDefaultTimeoutMs();
  const resourceLimits = options.resourceLimits ?? DEFAULT_RESOURCE_LIMITS;

  return new Promise<string>((resolve, reject) => {
    const worker = spawnSandboxWorker(workerBasename, input, resourceLimits);
    let settled = false;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        reject(new Error(`${errorLabel} render exceeded ${timeoutMs}ms timeout`));
      });
      // Best-effort teardown; the promise has already settled above.
      void worker.terminate();
    }, timeoutMs);

    worker.once("message", (message: SandboxRenderResult) => {
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
      finish(() => reject(new Error(`${errorLabel} render worker exited with code ${code}`)));
    });
  });
}
