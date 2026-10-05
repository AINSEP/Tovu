/**
 * @file `createPluginInvocationCoreDeps()` — the per-load backing for a plugin's capability-scoped
 * SDK (`content.read`, `content.extend`, `addFilter`), shared by every place that runs a plugin's
 * `setup()`: the in-process Tier-3 enable path (`server/runtime/composition/plugin-runtime.ts`) and
 * the Tier-2 worker (`tier2/run-call.ts`). One implementation, so a Tier-2 plugin sees exactly the
 * SDK semantics a Tier-3 plugin does (ADR-024 §3: the ABI is the same; only where the code runs
 * differs).
 *
 * `content.read`/`content.extend` are bound to the filter invocation that is currently running
 * (AsyncLocalStorage), never to load time: a plugin that calls them from `setup()` or from a timer
 * after its filter returned gets a named error instead of another save's entry.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { HOOK_CONTENT_ENTRY_BEFORE_SAVE, type BeforeSaveFilter, type ContentEntryDraft } from "@tovu/sdk";

import type { CapabilityScopedSdkCoreDeps } from "./capability-sdk.js";

interface InvocationState {
  readonly entry: Readonly<ContentEntryDraft>;
  readonly writes: Record<string, string | number | boolean>;
}

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
  const { pluginId, declaredHooks } = required;
  const invocation = new AsyncLocalStorage<InvocationState>();
  let capturedFilter: BeforeSaveFilter | null = null;

  const coreDeps: CapabilityScopedSdkCoreDeps = {
    getCurrentEntry(): Readonly<ContentEntryDraft> {
      const state = invocation.getStore();
      if (!state) throw new Error(`plugin '${pluginId}' called content.read outside a beforeSave hook`);
      return state.entry;
    },
    writeExtField(field: string, value: string | number | boolean): void {
      const state = invocation.getStore();
      if (!state) throw new Error(`plugin '${pluginId}' called content.extend outside a beforeSave hook`);
      state.writes[field] = value;
    },
    attachFilter(hookName: typeof HOOK_CONTENT_ENTRY_BEFORE_SAVE, filter: BeforeSaveFilter): void {
      if (hookName !== HOOK_CONTENT_ENTRY_BEFORE_SAVE || !declaredHooks.includes(hookName)) {
        throw new Error(`plugin '${pluginId}' attempted to attach undeclared hook '${String(hookName)}'`);
      }
      if (capturedFilter) {
        throw new Error(`plugin '${pluginId}' attempted to attach more than one beforeSave filter`);
      }

      capturedFilter = async (entry, ctx) => {
        const state: InvocationState = { entry, writes: {} };
        return invocation.run(state, async () => {
          const returned = await filter(entry, ctx);
          if (Object.keys(state.writes).length === 0) return returned;
          if (typeof returned !== "object" || returned === null || Array.isArray(returned)) return returned;
          return { ...state.writes, ...returned };
        });
      };
    },
  };

  return { coreDeps, capturedFilter: () => capturedFilter };
}
