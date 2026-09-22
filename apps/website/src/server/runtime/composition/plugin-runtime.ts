import { AsyncLocalStorage } from "node:async_hooks";
import { lstat } from "node:fs/promises";
import path from "node:path";

import type { ClockPort } from "@jini-ai/cms/core";

import type { PluginActivationRepoPort } from "#src/features/plugin-runtime/activation";
import type { BuiltInPluginSource, PluginDiscoveryRecord } from "#src/features/plugin-runtime/discovery";
import { discoverPlugins as discoverPluginRuntimePlugins, siteEntryPath } from "#src/features/plugin-runtime/discovery";
import { createHookRegistry, type AttachmentSource, type HookRegistry } from "#src/features/plugin-runtime/hook-registry";
import type { PluginManifest } from "#src/features/plugin-runtime/manifest";
import { quarantinePlugin } from "#src/features/plugin-runtime/quarantine";
import {
  PluginPackagePathError,
  readPluginPackageFiles as readPluginPackageDirectory,
  type PluginPackageFiles,
} from "#src/features/plugin-runtime/package-files";
import {
  attachLoadedPlugin,
  loadPlugin,
  PluginLoadError,
} from "#src/features/plugin-runtime/loader";
import {
  HOOK_CONTENT_ENTRY_BEFORE_SAVE,
  type BeforeSaveFilter,
  type ContentEntryDraft,
} from "@tovu/sdk";

/** Executable metadata for one compiled-in plugin. Discovery consumes only `manifest`; the enable
 * callback consumes the import seam after integrity/sdkRange checks. Site-artifact sources can use
 * the same shape once their install-dir resolver is composed here. */
export interface PluginRuntimeSource extends BuiltInPluginSource {
  readonly source: "built-in";
  readonly entryPath: string;
  readonly importModule: (entryPath: string) => Promise<unknown>;
  /** The built-in's own source folder, shown read-only by the admin Plugins screen's
   * package-files viewer (`routes/plugins/files.ts`). Omitted ⇒ that viewer lists no files. */
  readonly sourceDir?: string;
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

/**
 * A plugin id safe to use as a single filesystem path segment (Milestone 2, 2026-08-20) — the same
 * character class `src/features/agent-plugins/layout.ts`'s `SAFE_PLUGIN_ID_PATTERN` uses,
 * independently declared here rather than imported: that module is a DIFFERENT, unrelated plugin
 * system (agent-plugins.org format; see this file's own `PluginRuntimeSource` doc history and
 * Milestone 1's handoff for why the two are never wired together), and importing from it would
 * create exactly that coupling for a one-line regex. `.` and `-` are allowed mid-string (matching
 * real semver-adjacent plugin ids like `word-count`) but the pattern has no `/`, no `..`, and no
 * leading/trailing separator — it cannot itself produce a path-traversal segment.
 */
const SAFE_PLUGIN_ID_SEGMENT = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

/** Thrown when `pluginId` is not safe to use as a filesystem path segment
 * under `installDir` — either it fails {@link SAFE_PLUGIN_ID_SEGMENT}'s allowlist, or (defense in
 * depth, in case some future caller's id validation elsewhere ever drifts) the resolved absolute
 * path would land outside `installDir` after resolution. Deliberately fails closed on EITHER
 * check independently, not just the one presumed sufficient. */
export class PluginUninstallPathError extends Error {
  constructor(pluginId: string) {
    super(`plugin id '${pluginId}' is not a safe filesystem path segment — refusing to remove it`);
    this.name = "PluginUninstallPathError";
  }
}

/** A site plugin's version folder name as discovery read it from disk: one segment, no
 * separator, no leading dot. Checked together with {@link SAFE_PLUGIN_ID_SEGMENT} before either is
 * joined into a path. */
const SAFE_VERSION_SEGMENT = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;

/**
 * Where one discovered plugin's files live, for the package-files viewer: a built-in's own
 * `sourceDir`, or a site plugin's `<installDir>/<id>/<version>/` (REQ-02's layout, the same one
 * `siteEntryPath()` joins). The directory is its own container for a built-in; `installDir` is the
 * container for a site plugin, so `readPluginPackageFiles()`'s realpath check keeps a symlinked id
 * or version folder from reaching outside it.
 *
 * @returns `null` when there is no directory to show: a built-in without `sourceDir`, or a site
 *   record while `installDir` is unset.
 * @throws {PluginPackagePathError} a site record's id or version is not one safe path segment — a
 *   site record's id comes from its own manifest, so it is untrusted text until checked here.
 * @complexity O(sources.length).
 */
function resolvePackageLocation(params: {
  record: PluginDiscoveryRecord;
  sources: readonly PluginRuntimeSource[];
  installDir: string | undefined;
}): { rootDir: string; containerDir: string } | null {
  const { record, sources, installDir } = params;
  if (record.source === "built-in") {
    const sourceDir = sources.find((candidate) => candidate.manifest.id === record.id)?.sourceDir;
    return sourceDir === undefined ? null : { rootDir: sourceDir, containerDir: sourceDir };
  }
  if (installDir === undefined) return null;
  if (!SAFE_PLUGIN_ID_SEGMENT.test(record.id) || !SAFE_VERSION_SEGMENT.test(record.version)) {
    throw new PluginPackagePathError(`plugin '${record.id}' version '${record.version}' is not a safe path segment`);
  }
  return { rootDir: path.join(installDir, record.id, record.version), containerDir: installDir };
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
  readonly locatePluginPackageDirs: (pluginId: string) => Promise<{
    liveParent: string;
    liveNames: readonly string[];
    parkedDir: string;
  }>;
  /** Lists one discovered plugin's own files, read-only and bounded, for the admin Plugins
   * screen's package-files viewer — see {@link resolvePackageLocation} and
   * `features/plugin-runtime/package-files.ts`. Rejects with `PluginPackagePathError` for an
   * unsafe id/version or a directory that resolves outside its container. */
  readonly readPluginPackageFiles: (record: PluginDiscoveryRecord) => Promise<PluginPackageFiles>;
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

  async function locatePluginPackageDirs(pluginId: string): Promise<{
    liveParent: string;
    liveNames: readonly string[];
    parkedDir: string;
  }> {
    if (installDir === undefined) {
      throw new Error(`locatePluginPackageDirs: no installDir configured for this composition root — cannot remove '${pluginId}'`);
    }
    if (!SAFE_PLUGIN_ID_SEGMENT.test(pluginId)) {
      throw new PluginUninstallPathError(pluginId);
    }
    const installRoot = path.resolve(installDir);
    const liveDir = path.resolve(installRoot, pluginId);
    if (liveDir === installRoot || !liveDir.startsWith(installRoot + path.sep)) {
      throw new PluginUninstallPathError(pluginId);
    }
    const parkedRoot = path.resolve(path.dirname(installRoot), `${path.basename(installRoot)}-trash`);
    const parkedDir = path.resolve(parkedRoot, pluginId);
    if (parkedDir === parkedRoot || !parkedDir.startsWith(parkedRoot + path.sep)) {
      throw new PluginUninstallPathError(pluginId);
    }
    const liveNames = await lstat(liveDir).then(
      () => [pluginId],
      (error: unknown) => {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
        throw error;
      },
    );
    return { liveParent: installRoot, liveNames, parkedDir };
  }

  async function readPluginPackageFiles(record: PluginDiscoveryRecord): Promise<PluginPackageFiles> {
    const location = resolvePackageLocation({ record, sources, installDir });
    if (location === null) return { files: [], truncated: false };
    return readPluginPackageDirectory({ input: location });
  }

  return {
    hookRegistry,
    discoverPlugins,
    onPluginEnabled,
    onPluginDisabled,
    locatePluginPackageDirs,
    readPluginPackageFiles,
    beforeSaveHook: (entry) => hookRegistry.runBeforeSave(entry),
  };
}
