/**
 * ADR-020: Tovu theme budgets and worker paths over @jini-ai/sandbox/node-worker.
 * A main-thread Promise.race cannot interrupt synchronous template work. A fresh Node
 * worker gives the parent a termination boundary and V8 heap limits without a native
 * sandbox dependency or vm2's known escape problems. Engine workers own template semantics;
 * the package owns result settlement, timeout cancellation and best-effort worker cleanup.
 */
import { createRequire } from "node:module";
import path from "node:path";
import type { ResourceLimits } from "node:worker_threads";
import {
  createNodeWorkerFactory,
  createNodeWorkerScheduler,
  renderInWorkerSandbox as renderWithWorker,
  resolveDefaultTimeoutMs as resolveWorkerTimeout,
} from "@jini-ai/sandbox/node-worker";
import type { SiteRenderContext } from "./render.js";

export type { SandboxRenderResult } from "@jini-ai/sandbox/node-worker";

/** Plain structured-cloneable payload shared by the Liquid and Handlebars workers. */
export interface SandboxRenderInput {
  source: string;
  ctx: SiteRenderContext;
}

export interface SandboxOptions {
  timeoutMs?: number;
  resourceLimits?: ResourceLimits;
}

// Use require.resolve for the TS registration module: the worker bootstrap needs a
// filesystem path, whereas import.meta.resolve yields a file URL.
const require = createRequire(import.meta.url);
/**
 * A visitor must not wait beyond 5s for a runaway theme; load-scaled defaults would
 * weaken that guard exactly when the server is busiest. TOVU_THEME_RENDER_TIMEOUT_MS is
 * an explicit opt-in for slow VPS hosts and saturated CI, not a higher shared default.
 * The original CI incident ran seven agents on eight cores at load 135: a roughly 50ms
 * idle template falsely exceeded 5000ms, yet its test file passed alone. Explicit test
 * budgets (500ms termination, 15000ms memory failure) avoid depending on this default.
 */
const DEFAULT_RENDER_TIMEOUT_MS = 5_000;
// Five minutes exceeds legitimate slow-VPS rendering but stays finite; an absurd timeout
// defeats the runaway-theme guard as surely as a zero one.
const MAX_RENDER_TIMEOUT_MS = 300_000;
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  codeRangeSizeMb: 16,
};

/**
 * Resolve Tovu's live timeout configuration without freezing the environment at module load.
 * @returns A positive render budget, falling back to 5s for invalid values or values above 5min.
 * @complexity O(n) for n characters in the configured value.
 */
export function resolveDefaultTimeoutMs(): number {
  return resolveWorkerTimeout({
    rawValue: process.env.TOVU_THEME_RENDER_TIMEOUT_MS,
    defaultTimeoutMs: DEFAULT_RENDER_TIMEOUT_MS,
    maxTimeoutMs: MAX_RENDER_TIMEOUT_MS,
  });
}

/**
 * Liquid and Handlebars share this lifecycle machinery to prevent duplicated timeout
 * policy from drifting between engines. Their workers still own their template semantics.
 * Input must already be plain structured-cloneable site data. A rejected render is handled
 * by renderSite with a minimal built-in body (SPEC-004 REQ-10): a hostile theme must not 500
 * the site. ADR-020 bounds both CPU time and worker heap use.
 *
 * Render with Tovu's sibling worker entry and heap budgets, retaining engine caller contracts.
 * The TypeScript bootstrap stays host-resolved; Jini suppresses its worker's CJS coverage image.
 * @param workerBasename Worker path relative to this module, without an extension.
 * @param errorLabel Engine name used in controlled render errors.
 * @param input Structured-cloneable template and site context.
 * @param options Optional per-render wall-clock and heap budgets.
 * @returns Rendered HTML.
 * @throws On timeout, worker failure, invalid reply or rejected template; renderSite handles fallback.
 * @complexity O(e) environment copying for e variables, excluding worker startup and rendering.
 */
export function renderInWorkerSandbox(
  workerBasename: string,
  errorLabel: string,
  input: SandboxRenderInput,
  options: SandboxOptions = {},
): Promise<string> {
  const isTsSource = import.meta.filename.endsWith(".ts");
  const workerFactory = createNodeWorkerFactory({ env: { ...process.env } }, {
    ...(isTsSource ? { typescriptBootstrap: { registerModulePath: require.resolve("tsx/cjs/api") } } : {}),
  });
  return renderWithWorker({
    workerEntry: path.join(import.meta.dirname, `${workerBasename}.${isTsSource ? "ts" : "js"}`),
    input,
    errorLabel,
    defaultTimeoutMs: resolveDefaultTimeoutMs(),
    defaultResourceLimits: DEFAULT_RESOURCE_LIMITS,
    workerFactory,
    scheduler: createNodeWorkerScheduler({}),
  }, options);
}
