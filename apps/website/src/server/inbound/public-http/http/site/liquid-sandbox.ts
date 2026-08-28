import { renderInWorkerSandbox, type SandboxOptions, type SandboxRenderInput, type SandboxRenderResult } from "./worker-sandbox.js";

/**
 * @file ADR-020 Tier-2 guardrail: render isolation for LiquidJS templates.
 *
 * Purpose:
 * Renders a "templated"-tier theme body inside an isolated `worker_threads` Worker — spawn-per-
 * render, wall-clock timeout, V8 heap `resourceLimits` — via the shared machinery in
 * `worker-sandbox.ts`. See that module's `@file` header for why isolation works this way at all and
 * why `worker_threads` rather than `isolated-vm`/`vm2`.
 *
 * How it relates to the project:
 * Called from `render.ts`'s `renderSite()` in place of the old in-process `renderLiquidBody()`. The
 * actual Liquid engine + component-registry wiring lives in `liquid-worker.ts`, which the shared
 * sandbox spawns by file path (not by static import, so the main thread never needs to construct a
 * Liquid engine at all).
 */

export { resolveDefaultTimeoutMs } from "./worker-sandbox.js";

/** What one render needs, sent to the worker as `workerData` (structured-clone only — plain data, no functions/class instances). */
export interface LiquidWorkerInput extends SandboxRenderInput {
  /** Mirrors `ThemeManifest.skipLiquidAllowlist` — `loadTheme()` already made this decision at
   * discovery time; the worker's defensive re-lint (in case the file changed on disk since) honors
   * the same choice rather than re-deciding it. */
  skipLiquidAllowlist?: boolean;
}

/** The worker's reply, via `postMessage`. */
export type LiquidWorkerResult = SandboxRenderResult;

export type LiquidSandboxOptions = SandboxOptions;

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
  return renderInWorkerSandbox("liquid-worker", "Liquid", input, options);
}
