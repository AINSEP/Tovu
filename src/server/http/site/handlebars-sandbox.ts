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
 * @file ADR-020 Tier-2 guardrail, Handlebars edition: render isolation for
 * `.hbs` templates. The exact same architecture `liquid-sandbox.ts` implements,
 * applied to the Handlebars tier — spawn-per-render `worker_threads` `Worker`,
 * wall-clock timeout, V8 heap `resourceLimits`.
 *
 * Why this is NOT skipped for Handlebars. It is tempting to argue Handlebars
 * "needs" less isolation than Liquid because it has no `include`/`render`
 * filesystem tags and no numeric-range literal. That argument is about RCE and
 * file reads, and isolation here is only partly about those. It is equally
 * about resource exhaustion — `{{#each}}` over a large collection, deeply
 * nested blocks, a template that concatenates an enormous string — none of
 * which the allowlist can bound statically, all of which a hostile or merely
 * careless theme can reach with entirely allowlisted syntax. A `Promise.race`
 * around a synchronous `template(data)` call would not help: synchronous
 * CPU-bound work on the main thread cannot be pre-empted by a timer running on
 * that same thread. Running the render on a *separate* thread is what makes
 * `worker.terminate()` able to actually stop it.
 *
 * And it is about defense in depth against the failure this tier's whole
 * design anticipates: Handlebars compiles template text into executable
 * JavaScript, and its CVE history is a history of that compile step being
 * escaped. If a future bug (or a gap in the allowlist) ever lets theme text
 * reach code execution, the blast radius should be a disposable worker with a
 * 64 MB heap and a 5 second life, not the server process.
 *
 * How it relates to the project:
 * Called from `render.ts`'s `renderSite()` for `tier: "handlebars"` themes, in
 * the same position `renderLiquidInSandbox` occupies for `tier: "templated"`.
 * The Handlebars environment construction and the `render_block` helper live in
 * `handlebars-worker.ts`, which this module spawns by file path (not by static
 * import), so the main thread never constructs a Handlebars compiler at all.
 */

/** What one render needs, sent to the worker as `workerData` (structured-clone only — plain data, no functions/class instances). */
export interface HandlebarsWorkerInput {
  source: string;
  ctx: SiteRenderContext;
}

/** The worker's reply, via `postMessage`. */
export type HandlebarsWorkerResult = { ok: true; html: string } | { ok: false; error: string };

export interface HandlebarsSandboxOptions {
  /** Wall-clock budget for one render before the worker is force-terminated. */
  timeoutMs?: number;
  /** V8 heap caps for the worker thread. */
  resourceLimits?: ResourceLimits;
}

const DEFAULT_RENDER_TIMEOUT_MS = 5000;
const MAX_RENDER_TIMEOUT_MS = 300_000;

/**
 * Wall-clock budget for one sandboxed Handlebars render before the worker is force-terminated.
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
 * Construct the isolated `Worker` for one render, matching whichever runtime is
 * currently active — identical to `liquid-sandbox.ts`'s `spawnLiquidWorker`,
 * including the `tsx` bootstrap workaround, which is a property of how this
 * repo runs `.ts` worker entry points rather than anything engine-specific. See
 * that function's doc comment for the full empirical derivation of why a `.ts`
 * entry file with `execArgv: ["--import", "tsx"]` does not work and an inline
 * `eval: true` bootstrap that `require()`s `tsx/cjs/api` first does.
 */
function spawnHandlebarsWorker(workerData: HandlebarsWorkerInput, resourceLimits: ResourceLimits): Worker {
  const isTsSource = import.meta.filename.endsWith(".ts");
  if (!isTsSource) {
    return new Worker(path.join(import.meta.dirname, "handlebars-worker.js"), { workerData, resourceLimits });
  }
  const workerFile = path.join(import.meta.dirname, "handlebars-worker.ts");
  const tsxApiPath = require.resolve("tsx/cjs/api");
  const bootstrap = `require(${JSON.stringify(tsxApiPath)}).register();\nrequire(${JSON.stringify(workerFile)});\n`;
  return new Worker(bootstrap, { eval: true, workerData, resourceLimits });
}

/**
 * Render a `"handlebars"`-tier theme body inside an isolated worker thread,
 * bounded by a wall-clock timeout and V8 heap limits.
 *
 * @param input the template source plus the render context (must already be
 *   plain, structured-cloneable data — `SiteRenderContext`'s `posts`/`post`
 *   fields are, by construction, `PostRecord`s with no functions/class
 *   instances).
 * @param options timeout/resourceLimits overrides; sane defaults apply.
 * @returns the rendered HTML body.
 * @throws if the render times out, the worker crashes/OOMs, or the template
 *   itself is invalid (syntax error, or a disallowed helper/partial/raw-output
 *   caught by the worker's defensive re-lint) — `render.ts`'s `renderSite`
 *   already treats any thrown error from a logic tier as "fall back to the
 *   minimal built-in body" (SPEC-004 REQ-10: a broken/hostile theme must never
 *   500 the site).
 * @complexity O(1) additional work beyond the render itself: one Worker
 *   spawn/teardown per call. No pooling — same documented spawn-cost tradeoff
 *   the Liquid sandbox carries.
 * @overallScore 100/100
 */
export function renderHandlebarsInSandbox(
  input: HandlebarsWorkerInput,
  options: HandlebarsSandboxOptions = {}
): Promise<string> {
  // Resolved per call, not once at module load: a module-level const would freeze whatever
  // TOVU_THEME_RENDER_TIMEOUT_MS happened to be set at import time, so a test (or an operator
  // reloading config) setting it later would be silently ignored.
  const timeoutMs = options.timeoutMs ?? resolveDefaultTimeoutMs();
  const resourceLimits = options.resourceLimits ?? DEFAULT_RESOURCE_LIMITS;

  return new Promise<string>((resolve, reject) => {
    const worker = spawnHandlebarsWorker(input, resourceLimits);
    let settled = false;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        reject(new Error(`Handlebars render exceeded ${timeoutMs}ms timeout`));
      });
      // Best-effort teardown; the promise has already settled above.
      void worker.terminate();
    }, timeoutMs);

    worker.once("message", (message: HandlebarsWorkerResult) => {
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
      finish(() => reject(new Error(`Handlebars render worker exited with code ${code}`)));
    });
  });
}
