import { lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertPluginInstallIdle, installSitePlugin, previewSitePluginInstall, type PluginInstallerPort } from "#src/features/plugin-runtime/install";

import type { Clock as ClockPort } from "@jini-ai/core/primitives";

import type { PluginActivationRepoPort } from "#src/features/plugin-runtime/activation";
import type { DeclaredContentTypePorts } from "#src/features/plugin-runtime/declarative-content-types";
import { enableDeclaredPlugin } from "#src/features/plugin-runtime/declarative-enable";
import type { BuiltInPluginSource, PluginDiscoveryRecord } from "#src/features/plugin-runtime/discovery";
import { discoverPlugins as discoverPluginRuntimePlugins, siteEntryPath } from "#src/features/plugin-runtime/discovery";
import { createHookRegistry, type AttachmentSource, type HookRegistry } from "#src/features/plugin-runtime/hook-registry";
import type { PluginManifest } from "#src/features/plugin-runtime/manifest";
import { quarantinePlugin } from "#src/features/plugin-runtime/quarantine";
import type { ExtensionClaim } from "#src/features/plugin-runtime/claim-conflicts";
import {
  describeBootConflictQuarantine,
  PluginConflictError,
  resolvePluginConflicts,
  type PluginConflict,
} from "#src/features/plugin-runtime/plugin-claims";
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
import { createPluginInvocationCoreDeps } from "#src/features/plugin-runtime/invocation-core-deps";
import { snapshotPluginModuleGraph } from "#src/features/plugin-runtime/module-snapshot";
import { createTier2ImportSeam } from "#src/features/plugin-runtime/tier2/import-seam";
import type { Tier2CallRunner } from "#src/features/plugin-runtime/tier2/protocol";
import { createTier2WorkerRunner } from "#src/server/runtime/plugin-tier2/run-in-worker";
import { HOOK_CONTENT_ENTRY_BEFORE_SAVE, type BeforeSaveFilter } from "@tovu/sdk";

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
  /** Runs one Tier-2 (`tier: "tier-2"`) plugin call in isolation. Omitted ⇒ a fresh Node worker
   * per call (`server/runtime/plugin-tier2/run-in-worker.ts`); tests inject a shorter timeout. */
  readonly tier2CallRunner?: Tier2CallRunner;
  /** Site-installed plugin scan root, forwarded verbatim to `discoverPlugins({ installDir })`
   * (REQ-02). Omitted ⇒ legacy mode: built-ins only, identical to today's behavior (discovery.ts's
   * own EC-09/AC-16 contract) — this parameter only ADDS reachability for site-installed plugins,
   * it never changes what a caller who omits it observes. */
  readonly installDir?: string;
  /** Names core itself holds (routes, tools, permissions, tables, … — `claim-conflicts.ts` claims,
   * prefix claims allowed). A plugin claiming one is refused at enable and quarantined at boot.
   * Omitted ⇒ no core claims: plugin-vs-plugin conflicts are still detected. The real roots pass
   * `TOVU_CORE_EXTENSION_CLAIMS` (`core-extension-claims.ts`). */
  readonly coreClaims?: readonly ExtensionClaim[];
  /** Where plugins' declared content types are created (AW-7 Tier 1) — the roots bind
   * `createDeclaredContentTypePorts` over their content-type repo. Omitted ⇒ a plugin that declares
   * content types is refused at enable (see `declarative-enable.ts`). */
  readonly declaredContentTypes?: DeclaredContentTypePorts;
}

export interface PluginRuntimeBindings {
  readonly pluginInstaller?: PluginInstallerPort;
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
  /** Admin preview (AW-7): one attached plugin's beforeSave patch for a draft, nothing saved or
   * counted toward quarantine. `null` ⇒ not attached. See `HookRegistry.previewBeforeSave`. */
  readonly previewPluginBeforeSave: HookRegistry["previewBeforeSave"];
  /**
   * P0a fix (2026-09-23): re-runs `onPluginEnabled` for every plugin `activationRepo` durably
   * marks `enabled` for THIS composition's `workspaceId`. Before this existed, nothing replayed
   * that durable state into a freshly-constructed (empty) `hookRegistry` — a plugin enabled in a
   * prior process looked enabled in the admin UI and in `listAll()`, but its filter/action/
   * contribution never fired again until an operator disabled and re-enabled it. Best-effort: one
   * plugin failing to re-attach (e.g. its package was removed from disk) is logged and skipped, not
   * thrown, so it can never block the rest of boot (mirrors `seedBundledAgentPlugins`'s own
   * per-package isolation).
   */
  readonly attachEnabledPluginsAtBoot: () => Promise<void>;
  /** Every discovered plugin that has a name conflict right now — an enabled loser, or a plugin that
   * is off and WOULD be refused if turned on — for the admin screen and `plugins_list`. See
   * `features/plugin-runtime/plugin-claims.ts`'s `resolvePluginConflicts`. */
  readonly listPluginConflicts: () => Promise<ReadonlyMap<string, readonly PluginConflict[]>>;
}

/**
 * Server-layer composition for SPEC-005's runtime half. The application roots own the concrete
 * activation repo/source list; this helper builds the per-load core handles, delegates module
 * ownership/setup to `loadPlugin()`, and performs the one shared attach operation only after setup
 * has completed successfully.
 */
export function composePluginRuntime(required: ComposePluginRuntimeRequired): PluginRuntimeBindings {
  const { activationRepo, clock, sources, installDir } = required;
  const tier2CallRunner = required.tier2CallRunner ?? createTier2WorkerRunner({});
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

  const coreClaims = required.coreClaims ?? [];

  async function listPluginConflicts(
    discovery?: readonly PluginDiscoveryRecord[],
    optional: { candidateId?: string } = {},
  ): Promise<ReadonlyMap<string, readonly PluginConflict[]>> {
    const [records, activations] = await Promise.all([discovery ?? discoverPlugins(), activationRepo.listAll()]);
    return resolvePluginConflicts({ workspaceId: required.workspaceId, discovery: records, activations, coreClaims }, optional);
  }

  /** Enable-time conflict gate (2026-10-04): runs before `loadPlugin()`, so a plugin that would
   * take a name core or an enabled plugin holds never has its code imported. The candidate is
   * ordered after every enabled plugin — it is the newer one by definition. */
  async function assertNoConflicts(pluginId: string, discovery: readonly PluginDiscoveryRecord[]): Promise<void> {
    const conflicts = (await listPluginConflicts(discovery, { candidateId: pluginId })).get(pluginId);
    if (conflicts) throw new PluginConflictError({ pluginId, conflicts });
  }

  async function onPluginEnabled(pluginId: string): Promise<void> {
    // A package replacement and an enable cannot race: save-before-callback activation is
    // compensated if install owns the directory lock, while installs refuse an enabled row.
    if (installDir !== undefined) await assertPluginInstallIdle({ installDir });
    const discovery = await discoverPlugins();
    const record = discovery.find((candidate) => candidate.id === pluginId);
    if (!record) {
      throw new PluginLoadError(pluginId, "PLUGIN_EXPORT_INVALID");
    }
    await assertNoConflicts(pluginId, discovery);
    // No manifest ⇒ an invalid record: `attachPlugin`'s own fail-closed path reports it.
    if (!record.manifest) return attachPlugin(pluginId, record);
    // Declared contributions (AW-7 Tier 1) are applied only now, after the conflict gate; a tier-1
    // plugin's `loadCode` is never called.
    await enableDeclaredPlugin(
      { pluginId, workspaceId: required.workspaceId, manifest: record.manifest, loadCode: () => attachPlugin(pluginId, record) },
      required.declaredContentTypes ? { contentTypes: required.declaredContentTypes } : {},
    );
  }

  /** Load + attach one already-cleared plugin — `onPluginEnabled`'s body after its gates, shared
   * with boot, which clears every enabled plugin in ONE pass instead (see
   * `attachEnabledPluginsAtBoot`: per-plugin "candidate last" ordering would refuse the older
   * winner of a boot-time pair as well as the newer one). */
  async function attachPlugin(pluginId: string, record: PluginDiscoveryRecord): Promise<void> {
    const target = resolveLoadTarget({ pluginId, sources, record, installDir });
    if (!target) {
      throw new PluginLoadError(pluginId, "PLUGIN_EXPORT_INVALID");
    }
    const { manifest, entryPath, attachmentSource } = target;
    // Tier 2 (ADR-024 §3/§4): the plugin's code must never be imported into this process. Its
    // import seam probes it in a fresh worker and hands `loadPlugin()` a proxy whose filter is an
    // RPC; injected through `loadPlugin()`'s own `importModule` option, so integrity + sdkRange
    // still run first (CIC U-001). A site plugin's worker imports the integrity-checked module
    // snapshot, which `loadPlugin()` itself skips once a seam is injected.
    const importModule =
      manifest.tier === "tier-2"
        ? createTier2ImportSeam(
            { manifest, runCall: tier2CallRunner },
            record.source === "site"
              ? {
                  resolveWorkerEntry: async (siteEntry: string) =>
                    pathToFileURL(
                      await snapshotPluginModuleGraph({ pluginRoot: path.dirname(path.dirname(siteEntry)), manifest })
                    ).href,
                }
              : {}
          )
        : target.importModule;

    // The SDK backing (content.read/extend bound to the running filter, single declared beforeSave
    // filter) is shared with the Tier-2 worker — see `invocation-core-deps.ts`.
    const invocation = createPluginInvocationCoreDeps({ pluginId, declaredHooks: manifest.hooks });
    const coreDeps = invocation.coreDeps;

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

    const filter: BeforeSaveFilter | null = invocation.capturedFilter();
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

  /** Boot-time conflict pass (2026-10-04): the newer plugin of every conflicting pair is turned off
   * through the same durable quarantine record hook failures use, with the clash as its reason, so
   * it shows on the admin row and stays off on the next boot instead of racing the older one. */
  async function quarantineConflictingAtBoot(
    conflicts: ReadonlyMap<string, readonly PluginConflict[]>,
    enabledIds: ReadonlySet<string>,
  ): Promise<ReadonlySet<string>> {
    const quarantined = new Set<string>();
    for (const [pluginId, pluginConflicts] of conflicts) {
      if (!enabledIds.has(pluginId)) continue;
      const reason = describeBootConflictQuarantine(pluginConflicts);
      await quarantinePlugin({ deps: { clock, repo: activationRepo }, input: { pluginId, workspaceId: required.workspaceId, consecutiveFailures: 0, reason } });
      // eslint-disable-next-line no-console
      console.warn(`[plugin-runtime] '${pluginId}' quarantined at boot: ${reason}`);
      quarantined.add(pluginId);
    }
    return quarantined;
  }

  async function attachEnabledPluginsAtBoot(): Promise<void> {
    const records = await activationRepo.listAll();
    const enabledHere = records.filter(
      (record) => record.workspaceId === required.workspaceId && record.enabled
    );
    if (enabledHere.length === 0) return;
    let discovery: readonly PluginDiscoveryRecord[];
    let quarantined: ReadonlySet<string>;
    try {
      discovery = await discoverPlugins();
      quarantined = await quarantineConflictingAtBoot(
        await listPluginConflicts(discovery),
        new Set(enabledHere.map((record) => record.pluginId)),
      );
    } catch (error) {
      // Fail closed: without a finished conflict pass there is no telling which of two clashing
      // plugins should run, so none is attached this boot (each would previously have failed its
      // own discovery read here anyway). Logged, not thrown — same isolation as a per-plugin failure.
      // eslint-disable-next-line no-console
      console.warn(`[plugin-runtime] boot conflict check failed, no plugin attached: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    for (const record of enabledHere) {
      if (quarantined.has(record.pluginId)) continue;
      try {
        if (installDir !== undefined) await assertPluginInstallIdle({ installDir });
        const discovered = discovery.find((candidate) => candidate.id === record.pluginId);
        if (!discovered) throw new PluginLoadError(record.pluginId, "PLUGIN_EXPORT_INVALID");
        // A tier-1 plugin has no code to re-attach; its declared types were stored at enable.
        if (discovered.manifest?.tier === "tier-1") continue;
        await attachPlugin(record.pluginId, discovered);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `[plugin-runtime] boot re-attach failed for '${record.pluginId}': ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
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
    ...(installDir === undefined ? {} : { pluginInstaller: {
      preview: (input) => previewSitePluginInstall({ ...input, deps: { installDir, builtInIds: sources.map((source) => source.manifest.id), repo: activationRepo } }),
      install: (input) => installSitePlugin({ ...input, deps: { installDir, builtInIds: sources.map((source) => source.manifest.id), repo: activationRepo } }),
    } satisfies PluginInstallerPort }),
    hookRegistry,
    discoverPlugins,
    onPluginEnabled,
    onPluginDisabled,
    locatePluginPackageDirs,
    readPluginPackageFiles,
    beforeSaveHook: (entry) => hookRegistry.runBeforeSave(entry),
    previewPluginBeforeSave: (pluginId, entry) => hookRegistry.previewBeforeSave(pluginId, entry),
    attachEnabledPluginsAtBoot,
    listPluginConflicts: () => listPluginConflicts(),
  };
}
