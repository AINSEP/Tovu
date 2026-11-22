/**
 * @file `worker_threads` entry for ONE Tier-2 plugin call (ADR-024 §3/§4). Never imported by
 * server code: `run-in-worker.ts` spawns it by file path in a fresh, heap-limited worker per call,
 * and terminates it after the first reply or the timeout.
 *
 * The call logic is `Jini/packages/plugins/src/host/worker/run-call.ts`'s pure `runTier2Call()`,
 * wired to a worker's message port by `@jini-ai/plugins/host/worker`'s `startTier2Worker()`
 * (EXTRACT-S6 L1c); this file is the product entry that supplies the binding, SDK resolver and real
 * `import()`. `main()` is exported and auto-runs only when `!isMainThread`, so tests cover it in-process.
 *
 * The worker entry imports its product binding relatively: under tsx this entry is loaded through
 * a CJS `require()`, and every module it pulls in is startup time inside the call's timeout budget.
 */
import { isMainThread, parentPort, workerData } from "node:worker_threads";

import { pluginHostBinding } from "../../../features/plugin-runtime/host-binding.js";
import { CONTENT_ANALYZER_RUNTIME_SOURCE } from "../../../features/plugin-runtime/built-ins/content-analyzer/index.js";
import { PLUGIN_SDK_SPECIFIERS } from "@jini-ai/plugins/host";
import { startTier2Worker, type Tier2ImportPolicy } from "@jini-ai/plugins/host/worker";
import { registerPluginSdkResolver } from "../../../features/plugin-runtime/sdk-resolver.js";

export interface Tier2WorkerMainRequired {
  /** The `Tier2Request` the host posted as `workerData` (built by the server from a validated manifest). */
  readonly workerData: unknown;
  readonly parentPort: { postMessage(message: unknown): void } | null;
}

export interface Tier2WorkerMainOptional {
  /** Test seam. Omitted ⇒ on the real-import path, register the C043 import policy and both SDK
   * specifiers in this worker, then real `import()`. */
  readonly importModule?: (entryPath: string) => Promise<unknown>;
}

/**
 * C043: what a Tier-2 plugin's own modules may import by name — the SDK specifiers only, for every
 * plugin. Owner-approved exception (coordinator decision, may be revisited): the compiled-in
 * content-analyzer's registered entry also gets the EXACT two specifiers its own files import
 * (`analyze-content.ts`, `plugin.ts`). No directory is trusted, so another built-in, or a site
 * plugin, that imports either one is refused.
 */
export const TIER2_IMPORT_POLICY: Tier2ImportPolicy = {
  sdkSpecifiers: PLUGIN_SDK_SPECIFIERS,
  trustedImports: [{ entryPath: CONTENT_ANALYZER_RUNTIME_SOURCE.entryPath, specifiers: ["@jini-ai/cms/seo/content-analysis", "#src/platform/html/slug"] }],
};

/** Real `import()` of the plugin entry, used once `main()` has registered the SDK resolver.
 * Exported only so a test can pin tsx's dev-only rewrite of `import()`: under tsx a module whose
 * default export carries `__esModule` is unwrapped to that default (CJS interop), which a compiled
 * build never does. */
export function importPluginModule(entryPath: string): Promise<unknown> {
  return import(entryPath);
}

/**
 * Runs the posted request and posts its reply. CIC U-002: the SDK resolver is registered per
 * worker, before the plugin's first import, unless a test injects `importModule`. Jini's worker
 * start registers {@link TIER2_IMPORT_POLICY} for the entry first, on the same import path.
 *
 * @throws When there is no parent port (not inside a worker).
 * @complexity O(1) own work plus the plugin's import/setup/filter cost.
 */
export async function main(required: Tier2WorkerMainRequired, optional: Tier2WorkerMainOptional = {}): Promise<void> {
  return startTier2Worker(
    { ...required, binding: pluginHostBinding, importPolicy: TIER2_IMPORT_POLICY, registerSdkResolver: registerPluginSdkResolver, realImport: importPluginModule },
    optional,
  );
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
