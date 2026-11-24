/**
 * @file `createTier2WorkerRunner()` — Tovu's binding of the host side of the Tier-2 plugin ABI
 * (ADR-024 §3/§4) onto `@jini-ai/sandbox/node-worker/per-call-runner` (a FRESH bounded worker per call;
 * the rationale lives with that module). Tovu binds its sibling `worker.ts`/`typescript-bootstrap.cjs`
 * entry files, `TOVU_PLUGIN_TIER2_TIMEOUT_MS`, the Tier-2 budgets and the Tier-2 reply codec.
 * Modeled on the theme renderer's `server/inbound/public-http/http/site/worker-sandbox.ts`.
 *
 * Every transport failure (timeout, crash, heap limit, malformed reply) rejects, so the caller —
 * `Jini packages/plugins/src/host/worker/import-seam.ts`, then `hook-registry.ts` — fails the save closed and counts it toward
 * quarantine exactly as for a throwing in-process filter.
 */
import path from "node:path";
import type { ResourceLimits } from "node:worker_threads";

import type { WorkerFactory, WorkerScheduler } from "@jini-ai/sandbox/node-worker";
import { createPerCallWorkerRunner, resolvePerCallWorkerTimeoutMs } from "@jini-ai/sandbox/node-worker/per-call-runner";

import { decodeTier2Reply, type Tier2CallRunner } from "@jini-ai/plugins/host/worker";

/** A content analyzer is milliseconds of pure computation; 5s leaves room for worker + module
 * startup on a busy host without letting a runaway plugin hold a save open. Same budget and same
 * explicit-opt-in env policy as the theme renderer (its header records the CI load incident). */
const DEFAULT_TIER2_TIMEOUT_MS = 5_000;
/** A save is interactive; anything above a minute is a misconfiguration, not a budget. */
const MAX_TIER2_TIMEOUT_MS = 60_000;
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  codeRangeSizeMb: 16,
};
const TIER2_TIMEOUT_POLICY = {
  timeoutEnvKey: "TOVU_PLUGIN_TIER2_TIMEOUT_MS",
  defaultTimeoutMs: DEFAULT_TIER2_TIMEOUT_MS,
  maxTimeoutMs: MAX_TIER2_TIMEOUT_MS,
} as const;

/**
 * Reads `TOVU_PLUGIN_TIER2_TIMEOUT_MS` strictly (no `parseInt`: "5e3" must not become 5ms).
 *
 * @returns The configured positive budget, or 5000ms for a missing, malformed or >60s value.
 * @complexity O(n) for n characters in the configured value.
 */
export function resolveTier2TimeoutMs(required: { readonly env: NodeJS.ProcessEnv }): number {
  return resolvePerCallWorkerTimeoutMs({ ...TIER2_TIMEOUT_POLICY, env: required.env });
}

export type CreateTier2WorkerRunnerRequired = Record<string, never>;

export interface CreateTier2WorkerRunnerOptional {
  /** Per-call wall-clock budget. Omitted ⇒ {@link resolveTier2TimeoutMs} at call time. */
  readonly timeoutMs?: number;
  readonly resourceLimits?: ResourceLimits;
  /** Read for the timeout; only the Jini runtime/tooling allowlist reaches the worker. Omitted ⇒
   * `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Test seams over the Jini worker/timer ports. */
  readonly workerFactory?: WorkerFactory;
  readonly scheduler?: WorkerScheduler;
  /** `.ts` under tsx, `.js` in a compiled build. Omitted ⇒ this module's own extension. */
  readonly moduleExtension?: string;
}

/**
 * Builds the runner `Jini packages/plugins/src/host/worker/import-seam.ts` calls once per probe and once per filter invocation.
 *
 * @returns A runner that rejects on timeout, worker error, exit without reply, or invalid reply.
 * @complexity O(1) own work per call, excluding worker startup and plugin work.
 */
export function createTier2WorkerRunner(
  _required: CreateTier2WorkerRunnerRequired,
  { moduleExtension, env, ...optional }: CreateTier2WorkerRunnerOptional = {},
): Tier2CallRunner {
  return createPerCallWorkerRunner({
    ...TIER2_TIMEOUT_POLICY,
    env: env ?? process.env,
    entryDirectory: import.meta.dirname,
    workerEntryName: "worker",
    moduleExtension: moduleExtension ?? path.extname(import.meta.filename),
    // See `typescript-bootstrap.cjs`: tsx's CJS hook alone cannot load a `.ts` plugin through
    // the worker's dynamic `import()`.
    typescriptBootstrapPath: path.join(import.meta.dirname, "typescript-bootstrap.cjs"),
    defaultResourceLimits: DEFAULT_RESOURCE_LIMITS,
    errorLabel: ({ request }) => `plugin '${request.plugin.pluginId}' tier-2`,
    decodeResult: ({ message, request }) => decodeTier2Reply({ message, expectedKind: request.kind }),
  }, optional);
}
