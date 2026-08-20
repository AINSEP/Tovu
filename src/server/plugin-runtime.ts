import { AsyncLocalStorage } from "node:async_hooks";

import type { ClockPort } from "@jini-ai/cms/core";

import type { PluginActivationRepoPort } from "../features/plugin-runtime/activation.js";
import type { BuiltInPluginSource, PluginDiscoveryRecord } from "../features/plugin-runtime/discovery.js";
import { discoverPlugins as discoverPluginRuntimePlugins, siteEntryPath } from "../features/plugin-runtime/discovery.js";
import { createHookRegistry, type AttachmentSource, type HookRegistry } from "../features/plugin-runtime/hook-registry.js";
import type { PluginManifest } from "../features/plugin-runtime/manifest.js";
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

/** What `loadPlugin()` and `attachLoadedPlugin()` need for one enable attempt, resolved by
 * {@link resolveLoadTarget}. `importModule` is omitted (not `undefined`-valued) for a site target
 * so `loadPlugin()`'s own default — real `import()` — is what actually runs; only a built-in
 * target ever carries an explicit override (its test/production seam, unchanged by this type). */
interface PluginLoadTarget {
  readonly manifest: PluginManifest;
  readonly entryPath: string;
  readonly attachmentSource: AttachmentSource;
  readonly importModule?: (entryPath: string) => Promise<unknown>;
}

/**
 * Resolves ONE enable attempt's load target (Milestone 1b, 2026-08-20): a compiled-in built-in
 * plugin uses the composition root's own static `PluginRuntimeSource` — entirely unchanged from
 * before this slice, so every existing built-in test (including ones that inject a synthetic
 * `entryPath`/`importModule`, e.g. the auto-quarantine fixture) keeps behaving identically. A
 * site-installed plugin has no static source to find, so its target is derived instead from the
 * SAME discovery record `onPluginEnabled` already fetched this call — reusing `record.manifest`
 * (see that field's own doc for why this, not a second file read, is the TOCTOU-safe choice) and
 * `siteEntryPath()`'s REQ-02 layout convention.
 *
 * Deliberately does not itself touch integrity/`sdkRange`/`import()` — those stay exactly where
 * CIC U-001 requires them, inside `loadPlugin()`'s own fixed step order. This function only decides
 * WHICH manifest/entryPath/import-hook `loadPlugin()` is handed; it never calls `import()` itself
 * and never lets a caller reach one without going through `loadPlugin()`'s ordering first.
 *
 * @returns `null` when the id is neither a known built-in nor a valid, installDir-reachable site
 * record — the caller's existing fail-closed `PLUGIN_EXPORT_INVALID` behavior is unchanged.
 * @complexity O(sources.length) — one linear scan of the static built-in list; no I/O of its own.
 */
function resolveLoadTarget(params: {
  pluginId: string;
  sources: readonly PluginRuntimeSource[];
  record: PluginDiscoveryRecord;
  installDir: string | undefined;
}): PluginLoadTarget | null {
  const { pluginId, sources, record, installDir } = params;

  const builtIn = sources.find((candidate) => candidate.manifest.id === pluginId);
  if (builtIn) {
    return {
      manifest: builtIn.manifest,
      entryPath: builtIn.entryPath,
      attachmentSource: builtIn.source,
      importModule: builtIn.importModule,
    };
  }

  if (record.source === "site" && installDir !== undefined && record.manifest !== undefined) {
    return {
      manifest: record.manifest,
      entryPath: siteEntryPath(installDir, record.id, record.version),
      attachmentSource: record.source,
    };
  }

  return null;
}

export interface ComposePluginRuntimeRequired {
  readonly workspaceId: string;
  readonly clock: ClockPort;
  readonly activationRepo: PluginActivationRepoPort;
  readonly sources: readonly PluginRuntimeSource[];
  /** Consecutive hook failures before quarantine. Omitted uses the registry default. */
  readonly failureThreshold?: number;
  /** Site-installed plugin scan root, forwarded verbatim to `discoverPlugins({ installDir })`
   * (REQ-02). Omitted ⇒ legacy mode: built-ins only, identical to today's behavior (discovery.ts's
   * own EC-09/AC-16 contract) — this parameter only ADDS reachability for site-installed plugins,
   * it never changes what a caller who omits it observes. */
  readonly installDir?: string;
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
  const { activationRepo, clock, sources, installDir } = required;
  const hookRegistry = createHookRegistry({
    ...(required.failureThreshold === undefined ? {} : { failureThreshold: required.failureThreshold }),
    onQuarantine: async (input) => {
      await quarantinePlugin({ deps: { clock, repo: activationRepo }, input });
    },
  });
  // Reachability fix (previously always omitted `installDir`, so a plugin placed on disk was
  // never scanned no matter how the composition root itself was configured — see this function's
  // required-params doc).
  const discoverPlugins = () =>
    discoverPluginRuntimePlugins({ builtIns: sources, ...(installDir === undefined ? {} : { installDir }) });

  async function onPluginEnabled(pluginId: string): Promise<void> {
    const record = (await discoverPlugins()).find((candidate) => candidate.id === pluginId);
    if (!record) {
      throw new PluginLoadError(pluginId, "PLUGIN_EXPORT_INVALID");
    }
    const target = resolveLoadTarget({ pluginId, sources, record, installDir });
    if (!target) {
      throw new PluginLoadError(pluginId, "PLUGIN_EXPORT_INVALID");
    }
    const { manifest, entryPath, attachmentSource, importModule } = target;

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
        if (hookName !== HOOK_CONTENT_ENTRY_BEFORE_SAVE || !manifest.hooks.includes(hookName)) {
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

    // CIC U-001: `importModule` is omitted here (not passed as `undefined`) for a site target, so
    // `loadPlugin()`'s OWN default parameter (real `import()`) is what's used — this call site
    // never constructs or holds an import function capable of running before `loadPlugin()`'s
    // integrity/sdkRange steps; it only ever forwards a built-in's pre-existing test/production
    // seam, unchanged from before this slice.
    const result = await loadPlugin(
      { record, manifest, entryPath, coreDeps },
      { ...(importModule === undefined ? {} : { importModule }) }
    );
    if (!result.loaded) {
      throw new PluginLoadError(pluginId, result.reason);
    }

    const filter = capturedFilter as BeforeSaveFilter | null;
    if (manifest.hooks.includes(HOOK_CONTENT_ENTRY_BEFORE_SAVE) && filter === null) {
      throw new PluginLoadError(pluginId, "PLUGIN_HOOK_NOT_ATTACHED");
    }
    if (filter === null) return;

    try {
      attachLoadedPlugin({
        pluginId,
        source: attachmentSource,
        hookRegistry,
        filter,
        declaredFields: manifest.fields,
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
