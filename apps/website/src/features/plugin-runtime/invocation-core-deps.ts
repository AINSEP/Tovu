/**
 * @file `createPluginInvocationCoreDeps()` — the per-load backing for a plugin's capability-scoped
 * SDK (`content.read`, `content.extend`, `addFilter`), shared by every place that runs a plugin's
 * `setup()`: the in-process Tier-3 enable path (`server/runtime/composition/plugin-runtime.ts`) and
 * the Tier-2 worker (`Jini/packages/plugins/src/host/worker/run-call.ts`). One implementation, so a Tier-2 plugin sees exactly the
 * SDK semantics a Tier-3 plugin does (ADR-024 §3: the ABI is the same; only where the code runs
 * differs).
 *
 * `content.read`/`content.extend` are bound to the filter invocation that is currently running
 * (AsyncLocalStorage), never to load time: a plugin that calls them from `setup()` or from a timer
 * after its filter returned gets a named error instead of another save's entry.
 *
 * Extract-s6 L1b: the algorithm lives in `@jini-ai/plugins/host/node` (`createPluginInvocationBinding`).
 * This binder supplies Tovu's SDK hook id and keeps the rich `@tovu/sdk` typing on the old exports.
 */
import { HOOK_CONTENT_ENTRY_BEFORE_SAVE, type BeforeSaveFilter } from "@tovu/sdk";

import type { CapabilityScopedSdkCoreDeps } from "@jini-ai/plugins/host";
import { createPluginInvocationBinding } from "@jini-ai/plugins/host/node";

export interface CreatePluginInvocationCoreDepsRequired {
  readonly pluginId: string;
  /** The manifest's declared `hooks` — `addFilter` refuses any hook not listed here. */
  readonly declaredHooks: readonly string[];
}

export type CreatePluginInvocationCoreDepsOptional = {};

export interface PluginInvocationCoreDeps {
  /** Hand to `buildCapabilityScopedSdk()` (via `loadPlugin()`'s `coreDeps`). */
  readonly coreDeps: CapabilityScopedSdkCoreDeps;
  /** The beforeSave filter `setup()` attached, wrapped so `content.read`/`content.extend` work
   * while it runs; `null` until (or unless) setup attaches one. */
  capturedFilter(): BeforeSaveFilter | null;
}

/**
 * Builds one plugin load's SDK backing plus the slot its `setup()` fills with a beforeSave filter.
 *
 * @throws Nothing at build time. The returned handles throw when used outside a running filter,
 *   when an undeclared hook is attached, or when a second beforeSave filter is attached.
 * @complexity O(1) per call; a wrapped filter adds O(extend-write count) to merge writes.
 */
export function createPluginInvocationCoreDeps(
  required: CreatePluginInvocationCoreDepsRequired,
  _optional: CreatePluginInvocationCoreDepsOptional = {},
): PluginInvocationCoreDeps {
  const binding = createPluginInvocationBinding({ ...required, beforeSaveHook: HOOK_CONTENT_ENTRY_BEFORE_SAVE }, {});
  // The SDK filter is the plugin-domain filter over Tovu's richer entry; the wrapper passes the
  // SDK entry object through untouched, so the SDK type is the honest view of what callers get.
  return { coreDeps: binding.coreDeps, capturedFilter: () => binding.capturedFilter() as BeforeSaveFilter | null };
}
