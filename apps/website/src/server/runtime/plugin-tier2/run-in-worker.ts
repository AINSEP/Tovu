/**
 * @file `createTier2WorkerRunner()` — the host side of the Tier-2 plugin ABI (ADR-024 §3/§4): runs
 * each `Tier2Request` in a FRESH Node worker over `@jini-ai/sandbox/node-worker`, with a wall-clock
 * timeout and V8 heap limits, and decodes the reply. Modeled on the theme renderer's
 * `server/inbound/public-http/http/site/worker-sandbox.ts`, including its tsx bootstrap for `.ts`.
 *
 * Why a fresh worker per call (ADR-024 §4's ABI-boundary slice, not yet a real process sandbox): a
 * main-thread `Promise.race` cannot interrupt a plugin's synchronous loop, and a long-lived worker
 * would carry one save's module state into the next. A fresh worker gives the server a termination
 * boundary and a heap cap per call, and the plugin's code never runs in the server's isolate.
 *
 * Every transport failure (timeout, crash, heap limit, malformed reply) rejects, so the caller —
 * `tier2/import-seam.ts`, then `hook-registry.ts` — fails the save closed and counts it toward
 * quarantine exactly as for a throwing in-process filter.
 */
import path from "node:path";
import type { ResourceLimits } from "node:worker_threads";

import {
  createNodeWorkerFactory,
  createNodeWorkerScheduler,
  resolveDefaultTimeoutMs,
  runInWorkerSandbox,
  type WorkerFactory,
  type WorkerScheduler,
} from "@jini-ai/sandbox/node-worker";

import { decodeTier2Reply, type Tier2CallRunner } from "../../../features/plugin-runtime/tier2/protocol.js";

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

/** The only environment variables a Tier-2 worker receives. A plugin's code runs in that worker, so
 * the server's environment (API keys, database URLs, the root key) must never be copied in: these
 * are runtime/tooling settings only — `TSX_TSCONFIG_PATH` for the dev/test tsx bootstrap,
 * `NODE_V8_COVERAGE` so a compiled worker still reports coverage. */
const TIER2_WORKER_ENV_KEYS = ["NODE_ENV", "TZ", "TSX_TSCONFIG_PATH", "NODE_V8_COVERAGE"] as const;

/**
 * The explicit minimal environment for one Tier-2 worker: {@link TIER2_WORKER_ENV_KEYS} that are
 * set in `env`, nothing else.
 *
 * @complexity O(k) for the k allowlisted keys.
 */
export function tier2WorkerEnv(required: { readonly env: NodeJS.ProcessEnv }): NodeJS.ProcessEnv {
  const workerEnv: NodeJS.ProcessEnv = {};
  for (const key of TIER2_WORKER_ENV_KEYS) {
    const value = required.env[key];
    if (value !== undefined) workerEnv[key] = value;
  }
  return workerEnv;
}

/**
 * Reads `TOVU_PLUGIN_TIER2_TIMEOUT_MS` strictly (no `parseInt`: "5e3" must not become 5ms).
 *
 * @returns The configured positive budget, or 5000ms for a missing, malformed or >60s value.
 * @complexity O(n) for n characters in the configured value.
 */
export function resolveTier2TimeoutMs(required: { readonly env: NodeJS.ProcessEnv }): number {
  return resolveDefaultTimeoutMs({
    rawValue: required.env.TOVU_PLUGIN_TIER2_TIMEOUT_MS,
    defaultTimeoutMs: DEFAULT_TIER2_TIMEOUT_MS,
    maxTimeoutMs: MAX_TIER2_TIMEOUT_MS,
  });
}

export type CreateTier2WorkerRunnerRequired = Record<string, never>;

export interface CreateTier2WorkerRunnerOptional {
  /** Per-call wall-clock budget. Omitted ⇒ {@link resolveTier2TimeoutMs} at call time. */
  readonly timeoutMs?: number;
  readonly resourceLimits?: ResourceLimits;
  /** Read for the timeout; only its {@link tier2WorkerEnv} subset reaches the worker. Omitted ⇒
   * `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Test seams over the Jini worker/timer ports. */
  readonly workerFactory?: WorkerFactory;
  readonly scheduler?: WorkerScheduler;
  /** `.ts` under tsx, `.js` in a compiled build. Omitted ⇒ this module's own extension. */
  readonly moduleExtension?: string;
}

/**
 * Builds the runner `tier2/import-seam.ts` calls once per probe and once per filter invocation.
 *
 * @returns A runner that rejects on timeout, worker error, exit without reply, or invalid reply.
 * @complexity O(1) own work per call (a fixed-size env allowlist), excluding worker startup and
 * plugin work.
 */
export function createTier2WorkerRunner(
  _required: CreateTier2WorkerRunnerRequired,
  optional: CreateTier2WorkerRunnerOptional = {},
): Tier2CallRunner {
  return (request) => {
    const env = optional.env ?? process.env;
    const extension = optional.moduleExtension ?? path.extname(import.meta.filename);
    const workerFactory =
      optional.workerFactory ??
      createNodeWorkerFactory({ env: tier2WorkerEnv({ env }) }, {
        // See `typescript-bootstrap.cjs`: tsx's CJS hook alone cannot load a `.ts` plugin through
        // the worker's dynamic `import()`.
        ...(extension === ".ts"
          ? { typescriptBootstrap: { registerModulePath: path.join(import.meta.dirname, "typescript-bootstrap.cjs") } }
          : {}),
      });
    return runInWorkerSandbox({
      workerEntry: path.join(import.meta.dirname, `worker${extension}`),
      input: request,
      errorLabel: `plugin '${request.plugin.pluginId}' tier-2`,
      defaultTimeoutMs: optional.timeoutMs ?? resolveTier2TimeoutMs({ env }),
      defaultResourceLimits: optional.resourceLimits ?? DEFAULT_RESOURCE_LIMITS,
      workerFactory,
      scheduler: optional.scheduler ?? createNodeWorkerScheduler({}),
      decodeResult: ({ message }) => decodeTier2Reply(message, request.kind),
    });
  };
}
