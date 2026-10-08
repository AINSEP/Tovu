/**
 * @file `worker_threads` entry for ONE Tier-2 plugin call (ADR-024 §3/§4). Never imported by
 * server code: `run-in-worker.ts` spawns it by file path in a fresh, heap-limited worker per call,
 * and terminates it after the first reply or the timeout.
 *
 * The call logic is `Jini/packages/plugins/src/host/worker/run-call.ts`'s pure `runTier2Call()`; this file
 * only wires the worker's own message port and import mechanism to it. `main()` is exported and
 * auto-runs only when `!isMainThread`, so tests cover it in-process.
 *
 * The worker entry imports its product binding relatively: under tsx this entry is loaded through
 * a CJS `require()`, and every module it pulls in is startup time inside the call's timeout budget.
 */
import { isMainThread, parentPort, workerData } from "node:worker_threads";

import { pluginHostBinding } from "../../../features/plugin-runtime/host-binding.js";
import { runTier2Call } from "@jini-ai/plugins/host/worker";
import type { Tier2Request } from "@jini-ai/plugins/host/worker";
import { registerPluginSdkResolver } from "../boot/plugin-sdk-resolver.js";

export interface Tier2WorkerMainRequired {
  /** The `Tier2Request` the host posted as `workerData` (built by the server from a validated manifest). */
  readonly workerData: unknown;
  readonly parentPort: { postMessage(message: unknown): void } | null;
}

export interface Tier2WorkerMainOptional {
  /** Test seam. Omitted ⇒ register the `@tovu/sdk` resolver in this worker, then real `import()`. */
  readonly importModule?: (entryPath: string) => Promise<unknown>;
}

/** Real `import()` of the plugin entry, used once `main()` has registered the SDK resolver.
 * Exported only so a test can pin tsx's dev-only rewrite of `import()`: under tsx a module whose
 * default export carries `__esModule` is unwrapped to that default (CJS interop), which a compiled
 * build never does. */
export function importPluginModule(entryPath: string): Promise<unknown> {
  return import(entryPath);
}

/**
 * Runs the posted request and posts its reply.
 *
 * @throws When there is no parent port (not inside a worker).
 * @complexity O(1) own work plus the plugin's import/setup/filter cost.
 */
export async function main(required: Tier2WorkerMainRequired, optional: Tier2WorkerMainOptional = {}): Promise<void> {
  const port = required.parentPort;
  if (!port) throw new Error("the tier-2 plugin worker must run inside a worker_threads Worker");

  let importModule = optional.importModule;
  if (!importModule) {
    // CIC U-002, per worker: main-thread `module.register()` hooks do not reach a worker spawned
    // with `execArgv: []` (measured, Node v24.2.0), so without this a site plugin's
    // `import "@tovu/sdk"` fails, or resolves to a copy planted next to the plugin. Registered
    // before the plugin's first import.
    registerPluginSdkResolver();
    importModule = importPluginModule;
  }
  const importEntry = importModule;
  port.postMessage(await runTier2Call({ ...pluginHostBinding, request: required.workerData as Tier2Request, importModule: async ({ modulePath }) => {
    const imported = await importEntry(modulePath);
    return { exported: typeof imported === "object" && imported !== null ? (imported as { default?: unknown }).default : undefined };
  } }));
}

/**
 * Starts the call when this module is a worker's entry; a no-op on the main thread, so tests (and
 * any accidental main-thread import) can load this module without running anything.
 *
 * @returns The running call inside a worker; `undefined` on the main thread.
 * @complexity O(1).
 */
export function startIfWorker(required: Tier2WorkerMainRequired & { readonly isMainThread: boolean }): Promise<void> | undefined {
  return required.isMainThread ? undefined : main(required);
}

// Inside the real worker an uncaught rejection becomes the worker's `error` event, which the host
// turns into a rejected call.
void startIfWorker({ isMainThread, workerData, parentPort });
