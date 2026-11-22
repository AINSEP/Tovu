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
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMainThread, parentPort, workerData } from "node:worker_threads";

import { pluginHostBinding } from "../../../features/plugin-runtime/host-binding.js";
import { startTier2Worker } from "@jini-ai/plugins/host/worker";
import { registerPluginSdkResolver } from "../../../features/plugin-runtime/sdk-resolver.js";

export interface Tier2WorkerMainRequired {
  /** The `Tier2Request` the host posted as `workerData` (built by the server from a validated manifest). */
  readonly workerData: unknown;
  readonly parentPort: { postMessage(message: unknown): void } | null;
}

export interface Tier2WorkerMainOptional {
  /** Test seam. Omitted ⇒ register both SDK specifiers (and the C043 allowlist) in this worker, then real `import()`. */
  readonly importModule?: (entryPath: string) => Promise<unknown>;
}

/** Tovu's compiled-in plugins (`features/plugin-runtime/built-ins/`, the same relative place in
 * the `dist/` twin). Their code is the product's own, so it may import the host's packages. */
const BUILT_IN_PLUGINS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../features/plugin-runtime/built-ins");

function realPath(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return filePath; // a missing entry fails at import with Node's own plain message
  }
}

/**
 * The plugin package whose modules get the C043 import allowlist: the entry's grandparent
 * (`<package>/server/index.mjs`, the same root `runTier2Call` uses), as a `file:` URL ending in
 * `/`. Real paths, because the loader reports a module's real path as its `parentURL`.
 *
 * @returns `undefined` for a built-in (compiled into Tovu) or a request without an entry path.
 * @complexity O(path length).
 */
export function tier2PluginPackageUrl(required: { readonly workerData: unknown }): string | undefined {
  const entryPath = (required.workerData as { plugin?: { entryPath?: unknown } } | null)?.plugin?.entryPath;
  if (typeof entryPath !== "string") return undefined;
  const entryFile = realPath(entryPath.startsWith("file:") ? fileURLToPath(entryPath) : entryPath);
  if (!path.relative(realPath(BUILT_IN_PLUGINS_DIR), entryFile).startsWith("..")) return undefined;
  return pathToFileURL(path.dirname(path.dirname(entryFile))).href.replace(/\/?$/, "/");
}

/** Real `import()` of the plugin entry, used once `main()` has registered the SDK resolver.
 * Exported only so a test can pin tsx's dev-only rewrite of `import()`: under tsx a module whose
 * default export carries `__esModule` is unwrapped to that default (CJS interop), which a compiled
 * build never does. */
export function importPluginModule(entryPath: string): Promise<unknown> {
  return import(entryPath);
}

/**
 * Runs the posted request and posts its reply. CIC U-002: the SDK resolver is registered per
 * worker, before the plugin's first import, unless a test injects `importModule`; for a plugin
 * that is not a built-in it also carries the C043 import allowlist for that plugin's package.
 *
 * @throws When there is no parent port (not inside a worker).
 * @complexity O(1) own work plus the plugin's import/setup/filter cost.
 */
export async function main(required: Tier2WorkerMainRequired, optional: Tier2WorkerMainOptional = {}): Promise<void> {
  const pluginPackageUrl = tier2PluginPackageUrl(required);
  const registerSdkResolver = (): void => registerPluginSdkResolver(pluginPackageUrl === undefined ? {} : { pluginPackageUrl });
  return startTier2Worker({ ...required, binding: pluginHostBinding, registerSdkResolver, realImport: importPluginModule }, optional);
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
