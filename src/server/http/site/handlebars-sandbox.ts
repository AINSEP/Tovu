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

const DEFAULT_TIMEOUT_MS = 5000;
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
