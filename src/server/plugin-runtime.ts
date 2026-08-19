import { AsyncLocalStorage } from "node:async_hooks";

import type { ClockPort } from "@jini-ai/cms/core";

import type { PluginActivationRepoPort } from "../features/plugin-runtime/activation.js";
import type { BuiltInPluginSource, PluginDiscoveryRecord } from "../features/plugin-runtime/discovery.js";
import { discoverPlugins as discoverPluginRuntimePlugins } from "../features/plugin-runtime/discovery.js";
import { createHookRegistry, type HookRegistry } from "../features/plugin-runtime/hook-registry.js";
import { quarantinePlugin } from "../features/plugin-runtime/quarantine.js";
import {
  attachLoadedPlugin,
  loadPlugin,
  PluginLoadError,
} from "../features/plugin-runtime/loader.js";
import {
  HOOK_CONTENT_ENTRY_BEFORE_SAVE,
  type BeforeSaveFilter,
  type ContentEntryDraft,
} from "../../packages/sdk/src/index.js";

/** Executable metadata for one compiled-in plugin. Discovery consumes only `manifest`; the enable
 * callback consumes the import seam after integrity/sdkRange checks. Site-artifact sources can use
 * the same shape once their install-dir resolver is composed here. */
export interface PluginRuntimeSource extends BuiltInPluginSource {
  readonly source: "built-in";
  readonly entryPath: string;
  readonly importModule: (entryPath: string) => Promise<unknown>;
}

interface InvocationState {
  readonly entry: Readonly<ContentEntryDraft>;
  readonly writes: Record<string, string | number | boolean>;
}

export interface ComposePluginRuntimeRequired {
  readonly workspaceId: string;
  readonly clock: ClockPort;
  readonly activationRepo: PluginActivationRepoPort;
  readonly sources: readonly PluginRuntimeSource[];
  /** Consecutive hook failures before quarantine. Omitted uses the registry default. */
  readonly failureThreshold?: number;
}

export interface PluginRuntimeBindings {
  readonly hookRegistry: HookRegistry;
  readonly discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  readonly onPluginEnabled: (pluginId: string) => Promise<void>;
  readonly onPluginDisabled: (pluginId: string) => void;
  readonly beforeSaveHook: HookRegistry["runBeforeSave"];
}

/**
 * Server-layer composition for SPEC-005's runtime half. The application roots own the concrete
 * activation repo/source list; this helper builds the per-load core handles, delegates module
 * ownership/setup to `loadPlugin()`, and performs the one shared attach operation only after setup
 * has completed successfully.
 */
export function composePluginRuntime(required: ComposePluginRuntimeRequired): PluginRuntimeBindings {
  const { activationRepo, clock, sources } = required;
  const hookRegistry = createHookRegistry({
    ...(required.failureThreshold === undefined ? {} : { failureThreshold: required.failureThreshold }),
    onQuarantine: async (input) => {
      await quarantinePlugin({ deps: { clock, repo: activationRepo }, input });
    },
  });
  const discoverPlugins = () => discoverPluginRuntimePlugins({ builtIns: sources });

  async function onPluginEnabled(pluginId: string): Promise<void> {
    const source = sources.find((candidate) => candidate.manifest.id === pluginId);
    const record = (await discoverPlugins()).find((candidate) => candidate.id === pluginId);
    if (!source || !record) {
      throw new PluginLoadError(pluginId, "PLUGIN_EXPORT_INVALID");
    }

    const invocation = new AsyncLocalStorage<InvocationState>();
    let capturedFilter: BeforeSaveFilter | null = null;

    const coreDeps = {
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
        if (hookName !== HOOK_CONTENT_ENTRY_BEFORE_SAVE || !source.manifest.hooks.includes(hookName)) {
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

    const result = await loadPlugin(
      {
        record,
        manifest: source.manifest,
        entryPath: source.entryPath,
        coreDeps,
      },
      { importModule: source.importModule }
    );
    if (!result.loaded) {
      throw new PluginLoadError(pluginId, result.reason);
    }

    const filter = capturedFilter as BeforeSaveFilter | null;
    if (source.manifest.hooks.includes(HOOK_CONTENT_ENTRY_BEFORE_SAVE) && filter === null) {
      throw new PluginLoadError(pluginId, "PLUGIN_HOOK_NOT_ATTACHED");
    }
    if (filter === null) return;

    try {
      attachLoadedPlugin({
        pluginId,
        source: source.source,
        hookRegistry,
        filter,
        declaredFields: source.manifest.fields,
      });
    } catch (error) {
      hookRegistry.detach(pluginId);
      throw new PluginLoadError(pluginId, "PLUGIN_HOOK_ATTACH_FAILED", { cause: error });
    }
  }

  function onPluginDisabled(pluginId: string): void {
    hookRegistry.detach(pluginId);
  }

  return {
    hookRegistry,
    discoverPlugins,
    onPluginEnabled,
    onPluginDisabled,
    beforeSaveHook: (entry) => hookRegistry.runBeforeSave(entry),
  };
}
