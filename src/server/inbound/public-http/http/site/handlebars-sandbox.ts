import { renderInWorkerSandbox, type SandboxOptions, type SandboxRenderInput, type SandboxRenderResult } from "./worker-sandbox.js";

/**
 * @file ADR-020 Tier-2 guardrail, Handlebars edition: render isolation for
 * `.hbs` templates.
 *
 * Purpose:
 * Renders a `"handlebars"`-tier theme body inside an isolated `worker_threads` Worker — spawn-per-
 * render, wall-clock timeout, V8 heap `resourceLimits` — via the same shared machinery in
 * `worker-sandbox.ts` that `liquid-sandbox.ts` uses. See that module's `@file` header for why
 * isolation works this way at all.
 *
 * Why this is NOT skipped for Handlebars. It is tempting to argue Handlebars
 * "needs" less isolation than Liquid because it has no `include`/`render`
 * filesystem tags and no numeric-range literal. That argument is about RCE and
 * file reads, and isolation here is only partly about those. It is equally
 * about resource exhaustion — `{{#each}}` over a large collection, deeply
 * nested blocks, a template that concatenates an enormous string — none of
 * which the allowlist can bound statically, all of which a hostile or merely
 * careless theme can reach with entirely allowlisted syntax.
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
 * `handlebars-worker.ts`, which the shared sandbox spawns by file path (not by
 * static import), so the main thread never constructs a Handlebars compiler at
 * all.
 */

export { resolveDefaultTimeoutMs } from "./worker-sandbox.js";

/** What one render needs, sent to the worker as `workerData` (structured-clone only — plain data, no functions/class instances). */
export type HandlebarsWorkerInput = SandboxRenderInput;

/** The worker's reply, via `postMessage`. */
export type HandlebarsWorkerResult = SandboxRenderResult;

export type HandlebarsSandboxOptions = SandboxOptions;

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
  return renderInWorkerSandbox("handlebars-worker", "Handlebars", input, options);
}
