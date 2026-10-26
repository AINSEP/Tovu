import type { Tracker } from "@jini-ai/diagnostics/observability";
import { createPluginLookupFacade } from "@jini-ai/core/plugin-directory";
import { createPluginModuleImporter, type PluginBeforeSavePreview, pluginHostBinding } from "#src/features/plugin-runtime/host-binding";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { assertPluginInstallIdle, createPluginModuleSnapshotLifecycle, createPluginSourceService, installSitePlugin, PluginSnapshotLifecycleError, previewSitePluginInstall, pruneSitePluginVersions, type PluginInstallerPort, type PluginSourcePort } from "@jini-ai/plugins/host/node";
import { addedPluginCapabilities, createPluginContributionCapture, createPluginContributionRegistry, initializeBundledPlugins, pluginCapabilitySet, type AdmittedBrowserProvider, type BundledBrowserProviderApproval, type PluginContributionRegistry, type PluginSdk, setPluginEnabled, type PluginSourcePolicyPort } from '@jini-ai/plugins/host';
import { createSitePluginPolicy } from '#src/features/plugin-runtime/install';

import type { Clock as ClockPort } from "@jini-ai/core/primitives";

import type { PluginActivationRepoPort } from "@jini-ai/plugins/host";
import type { DeclaredContentTypePorts } from "@jini-ai/plugins/host";
import { enableDeclaredPlugin } from "@jini-ai/plugins/host";
import type { BuiltInPluginSource, PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";
import { discoverPlugins as discoverPluginRuntimePlugins, siteEntryPath } from "@jini-ai/plugins/host/node";
import { createHookRegistry, type AttachmentSource, type HookRegistry } from "@jini-ai/plugins/host";
import type { PluginManifest } from "@jini-ai/plugins/host";
import { quarantinePlugin } from "@jini-ai/plugins/host";
import type { ExtensionClaim } from "@jini-ai/plugins/host";
import { describeBootConflictQuarantine, PluginConflictError, resolvePluginConflicts, type PluginConflict } from "@jini-ai/plugins/host";
import { PluginPackagePathError, readPluginPackageFiles as readPluginPackageDirectory, type PluginPackageFiles } from "@jini-ai/plugins/host/node";
import { attachLoadedPlugin } from "@jini-ai/plugins/host";
import { loadPlugin, PluginLoadError } from "@jini-ai/plugins/host/node";
import { createTier2ImportSeam } from "@jini-ai/plugins/host/worker";
import type { Tier2CallRunner } from "@jini-ai/plugins/host/worker";
import { createTier2WorkerRunner } from "#src/server/runtime/plugin-tier2/run-in-worker";
import { HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "@tovu/sdk";
import type { BeforeSaveHookPort } from "#src/features/post/index";

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
 * so the host binding supplies the contained snapshot importer; only a built-in target carries
 * an explicit scalar override (its test/production seam, unchanged by this type). */
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
      entryPath: siteEntryPath({ installDir, id: record.id, version: record.version }),
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
  readonly productTracker?: () => Pick<Tracker, 'capture'>;
  /** Review pins and first-boot defaults supplied only by the product composition roots. */
  readonly browserProviderApprovals?: readonly BundledBrowserProviderApproval[];
  readonly bundledEnabledIds?: readonly string[];
  readonly pluginSourcePolicy?: PluginSourcePolicyPort;
  readonly getPluginHost?: () => import("#src/contracts/headless/plugin-host").PluginHostPort | undefined;
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
  /** Call after provider teardown and stopped hook users; drains copies and releases owned graphs. */
  readonly dispose: (required: Record<string, never>, optional?: Record<string, never>) => Promise<void>;
  /** Successfully attached, admitted providers only; disable/quarantine retires their assets. */
  readonly browserProviders: (input: Record<string, never>, options?: Record<string, never>) => { generation: number; providers: readonly AdmittedBrowserProvider[] };
  readonly pluginSource?: PluginSourcePort;
  readonly pluginSourcePolicy: PluginSourcePolicyPort;
  /** Actual loaded snapshot revision, used by the existing cross-process activation poll. */
  readonly pluginLoadedVersion: (required: { id: string }, optional?: Record<string, never>) => string | undefined;
  readonly pluginInstaller?: PluginInstallerPort;
  readonly hookRegistry: HookRegistry;
  readonly pluginContributions: PluginContributionRegistry;
  /** Provider factories of admitted provider plugins only (`createPluginProviderHost` reads this).
   * Separate from `pluginContributions`, whose route/tool/widget snapshots carry no providers. */
  readonly providerContributions: PluginContributionRegistry;
  /**
   * Boot-only: loads the given provider plugins when each is installed and enabled here, admitting
   * their factories into `providerContributions`. Provider plugins are loaded nowhere else (boot
   * re-attach and enable skip them), so a running provider is never replaced mid-process; enabling
   * one takes effect at the next boot, disabling or quarantining one retires it immediately.
   * @returns The ids actually loaded. Per-plugin failures are logged and skipped, never thrown.
   */
  readonly loadProviderPlugins: (required: { pluginIds: readonly string[] }, optional?: { timeoutMs?: number }) => Promise<readonly string[]>;
  /** Installed + enabled plugins here that declare providers, with their declarations (manifest only). */
  readonly listProviderPlugins: (required: Record<string, never>, optional?: Record<string, never>) => Promise<readonly { pluginId: string; providers: NonNullable<NonNullable<PluginManifest["contributes"]>["providers"]> }[]>;
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
   * `Jini/packages/plugins/src/host/node/package-files.ts`. Rejects with `PluginPackagePathError` for an
   * unsafe id/version or a directory that resolves outside its container. */
  readonly readPluginPackageFiles: (record: PluginDiscoveryRecord) => Promise<PluginPackageFiles>;
  readonly beforeSaveHook: BeforeSaveHookPort;
  /** Admin preview (AW-7): one attached plugin's beforeSave patch for a draft, nothing saved or
   * counted toward quarantine. `null` ⇒ not attached. See `HookRegistry.previewBeforeSave`. */
  readonly previewPluginBeforeSave: PluginBeforeSavePreview;
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
   * `Jini/packages/plugins/src/host/plugin-claims.ts`'s `resolvePluginConflicts`. */
  readonly listPluginConflicts: () => Promise<ReadonlyMap<string, readonly PluginConflict[]>>;
}

/** True when a manifest declares provider factories (`contributes.providers`). */
function declaresProviders({ manifest }: { manifest: PluginManifest | undefined }): boolean {
  return (manifest?.contributes?.providers?.length ?? 0) > 0;
}

/**
 * Server-layer composition for SPEC-005's runtime half. The application roots own the concrete
 * activation repo/source list; this helper builds the per-load core handles, delegates module
 * ownership/setup to `loadPlugin()`, and performs the one shared attach operation only after setup
 * has completed successfully.
 */
export function composePluginRuntime(required: ComposePluginRuntimeRequired, _optional: Record<string, never> = {}): PluginRuntimeBindings {
  const { activationRepo, clock, sources, installDir } = required;
  const quarantineDeps = { clock, repo: activationRepo, onQuarantined: ({ pluginId }: { pluginId: string; workspaceId: string }) =>
    required.productTracker?.().capture({ name: "plugin_quarantined", userId: "system" }, { properties: { pluginId, pluginKind: "cms", reasonClass: "lifecycle" } }) };
  // The install directory owns versions; its sibling runtime directory owns executable graphs.
  const snapshots = installDir === undefined ? undefined : createPluginModuleSnapshotLifecycle({ runtimeRoot: path.resolve(installDir) + "-runtime" });
  const pendingAttachments = new Set<Promise<void>>();
  let closing = false;
  const pluginSourcePolicy = required.pluginSourcePolicy ?? createSitePluginPolicy({ env: process.env });
  const loadedVersions = new Map<string, string>();
  const browserProviders = new Map<string, readonly AdmittedBrowserProvider[]>();
  let browserGeneration = 0;
  const pluginContributions = createPluginContributionRegistry({});
  const providerContributions = createPluginContributionRegistry({});
  // Only boot's configured selection may admit provider factories (`loadProviderPlugins`).
  const selectedProviders = new Set<string>();
  const loadEpochs = new Map<string, number>();
  const tier2CallRunner = required.tier2CallRunner ?? createTier2WorkerRunner({});
  const hookRegistry = createHookRegistry({ pluginSdkBinding: pluginHostBinding.pluginSdkBinding }, {
    ...(required.failureThreshold === undefined ? {} : { failureThreshold: required.failureThreshold }),
    onQuarantine: async (input) => {
      onPluginDisabled(input.pluginId);
      await quarantinePlugin({ deps: quarantineDeps, input });
    },
  });
  // Reachability fix (previously always omitted `installDir`, so a plugin placed on disk was
  // never scanned no matter how the composition root itself was configured — see this function's
  // required-params doc).
  const discoverPlugins = () =>
    discoverPluginRuntimePlugins({ ...pluginHostBinding, builtIns: sources, ...(installDir === undefined ? {} : { installDir }) });

  /** Retained versions make the activation row's existing active pointer meaningful at boot
   * and reload. A newly installed version is not running until controlled reload advances it. */
  async function discoverActivePlugins(): Promise<readonly PluginDiscoveryRecord[]> {
    const rows = await activationRepo.listAll();
    const versions = new Map(rows.filter(row => row.workspaceId === required.workspaceId && row.enabled).map(row => [row.pluginId, row.version]));
    return discoverPluginRuntimePlugins({ ...pluginHostBinding, builtIns: sources, ...(installDir === undefined ? {} : { installDir }) }, { versions });
  }

  const coreClaims = required.coreClaims ?? [];

  async function listPluginConflicts(
    discovery?: readonly PluginDiscoveryRecord[],
    optional: { candidateId?: string } = {},
  ): Promise<ReadonlyMap<string, readonly PluginConflict[]>> {
    const [records, activations] = await Promise.all([discovery ?? discoverPlugins(), activationRepo.listAll()]);
    return resolvePluginConflicts({ ...pluginHostBinding, workspaceId: required.workspaceId, discovery: records, activations, coreClaims }, optional);
  }

  /** Install preview (2026-10-04): what the staged package would clash with if turned on in THIS
   * workspace now. A synthetic valid record stands in for it and REPLACES an installed version of the
   * same id, so an upgrade is judged by its new manifest only. */
  async function installPreviewConflicts(required: { manifest: PluginManifest }): Promise<readonly PluginConflict[]> {
    const { manifest } = required;
    const staged: PluginDiscoveryRecord = { id: manifest.id, name: manifest.name, version: manifest.version, source: "site", tier: manifest.tier, status: "valid", errors: [], manifest };
    const discovery = [...(await discoverPlugins()).filter((record) => record.id !== manifest.id), staged];
    return (await listPluginConflicts(discovery, { candidateId: manifest.id })).get(manifest.id) ?? [];
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
    const discovery = await discoverActivePlugins();
    const record = discovery.find((candidate) => candidate.id === pluginId);
    if (!record) {
      throw new PluginLoadError(pluginId, "PLUGIN_EXPORT_INVALID");
    }
    await assertNoConflicts(pluginId, discovery);
    // Provider plugins initialize once, at boot, before application work (`loadProviderPlugins`).
    if (declaresProviders({ manifest: record.manifest })) return;
    // No manifest ⇒ an invalid record: `attachPlugin`'s own fail-closed path reports it.
    if (!record.manifest) return attachPlugin(pluginId, record);
    // Declared contributions (AW-7 Tier 1) are applied only now, after the conflict gate; a tier-1
    // plugin's `loadCode` is never called.
    await enableDeclaredPlugin(
      { ...pluginHostBinding, pluginId, workspaceId: required.workspaceId, manifest: record.manifest, loadCode: () => attachPlugin(pluginId, record), unloadCode: () => onPluginDisabled(pluginId) },
      required.declaredContentTypes ? { contentTypes: required.declaredContentTypes } : {},
    );
    loadedVersions.set(pluginId, record.version);
  }

  /** Load + attach one already-cleared plugin — `onPluginEnabled`'s body after its gates, shared
   * with boot, which clears every enabled plugin in ONE pass instead (see
   * `attachEnabledPluginsAtBoot`: per-plugin "candidate last" ordering would refuse the older
   * winner of a boot-time pair as well as the newer one). */
  function attachPlugin(pluginId: string, record: PluginDiscoveryRecord): Promise<void> {
    if (closing) return Promise.reject(new PluginSnapshotLifecycleError({ code: "SNAPSHOTS_CLOSED" }));
    const attachment = performPluginAttachment(pluginId, record);
    pendingAttachments.add(attachment);
    void attachment.then(() => pendingAttachments.delete(attachment), () => pendingAttachments.delete(attachment));
    return attachment;
  }

  /** Keep import and setup in the same shutdown drain: setup may make late graph imports too. */
  async function performPluginAttachment(pluginId: string, record: PluginDiscoveryRecord): Promise<void> {
    const epoch = (loadEpochs.get(pluginId) ?? 0) + 1;
    loadEpochs.set(pluginId, epoch);
    const target = resolveLoadTarget({ pluginId, sources, record, installDir });
    if (!target) {
      throw new PluginLoadError(pluginId, "PLUGIN_EXPORT_INVALID");
    }
    const { manifest, entryPath, attachmentSource } = target;
    // The SDK backing (content.read/extend bound to the running filter, single declared beforeSave
    // filter) is shared with the Tier-2 worker — see `invocation-core-deps.ts`.
    const invocation = pluginHostBinding.createInvocationCoreDeps({ pluginId, declaredHooks: manifest.hooks });
    const capture = createPluginContributionCapture({ manifest });
    let scopedSdk: PluginSdk | undefined;
    const coreDeps = { ...invocation.coreDeps, contributions: capture };

    // CIC U-001: Jini invokes this required port only AFTER integrity/sdkRange checks. A site
    // target takes the contained immutable snapshot; built-in seams retain their original path.
    const moduleImporter = resolveRuntimeImporter({ target, record });
    const result = await loadPlugin(
      { ...pluginHostBinding, record, manifest, entryPath, coreDeps, importModule: moduleImporter,
        browserProviderApprovals: required.browserProviderApprovals ?? [],
        providerContributions: { registry: providerContributions, isSelected: ({ pluginId: id }) => selectedProviders.has(id) },
        pluginSdkBinding: { ...pluginHostBinding.pluginSdkBinding,
          buildSdk: ({ sdk }) => {
            const host = required.getPluginHost?.();
            scopedSdk = { ...pluginHostBinding.pluginSdkBinding.buildSdk({ sdk }),
              ...(host ? { plugins: createPluginLookupFacade({ lookup: host }) } : {}),
            };
            return scopedSdk;
          },
        },
      },
      {},
    );
    if (!result.loaded) {
      throw new PluginLoadError(pluginId, result.reason);
    }

    // A disable or a newer load during import/setup must not resurrect the retired generation.
    if (loadEpochs.get(pluginId) !== epoch || !scopedSdk) throw new PluginLoadError(pluginId, 'PLUGIN_SETUP_FAILED');
    const contributions = capture.seal({ sdk: scopedSdk });
    const filter = invocation.capturedFilter();
    if (manifest.hooks.includes(HOOK_CONTENT_ENTRY_BEFORE_SAVE) && filter === null) {
      throw new PluginLoadError(pluginId, "PLUGIN_HOOK_NOT_ATTACHED");
    }
    publishPluginAttachment({ pluginId, manifest, attachmentSource, filter, contributions,
      providers: result.browserProviders ?? [], version: record.version });
  }

  function resolveRuntimeImporter({ target, record }: { target: PluginLoadTarget; record: PluginDiscoveryRecord }, _options = {}) {
    // Tier 2 (ADR-024 §3/§4): the plugin's code must never be imported into this process. Its
    // import seam probes it in a fresh worker and hands `loadPlugin()` a proxy whose filter is an
    // RPC; supplied as `loadPlugin()`'s required `importModule` port, so integrity + sdkRange
    // still run first (CIC U-001). Only a built-in reaches here as tier-2: discovery marks a site
    // tier-2 package invalid (the worker is no sandbox yet). Were site tier-2 ever allowed, its worker
    // would need the seam's `resolveWorkerEntry` pointed at the integrity-checked module snapshot,
    // since an injected worker seam bypasses the host's default snapshot importer.
    return target.manifest.tier === "tier-2"
      ? createTier2ImportSeam({ ...pluginHostBinding, manifest: target.manifest, runCall: tier2CallRunner })
      : createPluginModuleImporter({ manifest: target.manifest, source: record.source }, {
          ...(target.importModule === undefined ? {} : { importModule: target.importModule }),
          ...(snapshots === undefined ? {} : { snapshots }),
        });
  }

  function publishPluginAttachment({ pluginId, manifest, attachmentSource, filter, contributions, providers, version }: {
    pluginId: string; manifest: PluginManifest; attachmentSource: AttachmentSource;
    filter: Parameters<typeof attachLoadedPlugin>[0]["filter"] | null;
    contributions: ReturnType<ReturnType<typeof createPluginContributionCapture>["seal"]>;
    providers: readonly AdmittedBrowserProvider[]; version: string;
  }, _options = {}): void {
    if (filter === null) {
      pluginContributions.replace({ contributions });
      retainBrowserProviders({ pluginId, providers });
      hookRegistry.detach({ pluginId });
      loadedVersions.set(pluginId, version);
      return;
    }

    try {
      attachLoadedPlugin({
        pluginId,
        source: attachmentSource,
        hookRegistry,
        filter,
        declaredFields: manifest.fields,
      });
      pluginContributions.replace({ contributions });
      retainBrowserProviders({ pluginId, providers });
      loadedVersions.set(pluginId, version);
    } catch (error) {
      hookRegistry.detach({ pluginId });
      throw new PluginLoadError(pluginId, "PLUGIN_HOOK_ATTACH_FAILED", { cause: error });
    }
  }

  /** Publish admission only after successful attachment; no partial setup can leak assets.
   * @complexity O(1) map replacement; Jini already owns the immutable asset bytes.
   */
  function retainBrowserProviders({ pluginId, providers }: { pluginId: string; providers: readonly AdmittedBrowserProvider[] }): void {
    if (providers.length === 0 && !browserProviders.has(pluginId)) return;
    browserProviders.set(pluginId, providers);
    browserGeneration++;
  }

  function onPluginDisabled(pluginId: string): void {
    if (browserProviders.delete(pluginId)) browserGeneration++;
    loadEpochs.set(pluginId, (loadEpochs.get(pluginId) ?? 0) + 1);
    pluginContributions.detach({ pluginId });
    // Retires the provider generation: the provider host disposes its initialized resources.
    selectedProviders.delete(pluginId);
    providerContributions.detach({ pluginId });
    hookRegistry.detach({ pluginId });
    loadedVersions.delete(pluginId);
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
      const reason = describeBootConflictQuarantine({ conflicts: pluginConflicts });
      await quarantinePlugin({ deps: quarantineDeps, input: { pluginId, workspaceId: required.workspaceId, consecutiveFailures: 0, reason } });
      onPluginDisabled(pluginId);
      // eslint-disable-next-line no-console
      console.warn(`[plugin-runtime] '${pluginId}' quarantined at boot: ${reason}`);
      quarantined.add(pluginId);
    }
    return quarantined;
  }

  async function initializeBootDefaults(_required: Record<string, never>, _options = {}) {
    // Serialize first-boot defaults with boot attachment. Existing disabled/quarantined rows win.
    const initialized = await initializeBundledPlugins({
      deps: { clock, repo: activationRepo, discovery: required.bundledEnabledIds?.length ? await discoverPlugins().catch((error: unknown) => {
        console.warn("[plugin-runtime] bundled discovery failed; chart providers remain unavailable", error);
        return [];
      }) : [], onEnabled: onPluginEnabled, onDisabled: onPluginDisabled },
      input: { workspaceId: required.workspaceId, pluginIds: required.bundledEnabledIds ?? [] },
    });
    for (const failure of initialized.failed) console.warn(`[plugin-runtime] bundled initialization failed for '${failure.pluginId}'`, failure.error);
    return initialized;
  }

  async function attachEnabledPluginsAtBoot(): Promise<void> {
    await snapshots?.ready;
    const initialized = await initializeBootDefaults({}, {});
    const records = await activationRepo.listAll();
    const enabledHere = records.filter(
      (record) => record.workspaceId === required.workspaceId && record.enabled
    );
    if (enabledHere.length === 0) return;
    let discovery: readonly PluginDiscoveryRecord[];
    let quarantined: ReadonlySet<string>;
    try {
      discovery = await discoverActivePlugins();
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
      for (const record of enabledHere) onPluginDisabled(record.pluginId);
      return;
    }
    for (const record of enabledHere) {
      // The initializer already attached it.
      if (quarantined.has(record.pluginId) || initialized.enabled.includes(record.pluginId)) continue;
      await reattachBootPlugin({ pluginId: record.pluginId, discovery });
    }
  }

  async function reattachBootPlugin({ pluginId, discovery }: { pluginId: string; discovery: readonly PluginDiscoveryRecord[] }, _options = {}): Promise<void> {
    try {
      if (installDir !== undefined) await assertPluginInstallIdle({ installDir });
      const discovered = discovery.find((candidate) => candidate.id === pluginId);
      if (!discovered) throw new PluginLoadError(pluginId, "PLUGIN_EXPORT_INVALID");
      // A tier-1 plugin has no code to re-attach; its declared types were stored at enable.
      // Provider plugins were already loaded by `loadProviderPlugins`, ahead of application work.
      if (discovered.manifest?.tier === "tier-1" || declaresProviders({ manifest: discovered.manifest })) return;
      await attachPlugin(pluginId, discovered);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[plugin-runtime] boot re-attach failed for '${pluginId}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /** Import + setup of one selected provider plugin, bounded: boot never waits on a stalled plugin. On the
   *  deadline the caller revokes the selection (`onPluginDisabled`), so a late setup cannot publish. */
  async function attachProviderWithin({ record, timeoutMs }: { record: PluginDiscoveryRecord; timeoutMs: number }): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`provider plugin load timed out after ${timeoutMs} ms`)), timeoutMs);
    });
    const attached = attachPlugin(record.id, record);
    // Observed even after the deadline wins, so a late failure is never an unhandled rejection.
    attached.catch(() => {});
    try { await Promise.race([attached, deadline]); } finally { clearTimeout(timer); }
  }

  async function listProviderPlugins(_required: Record<string, never>, _options = {}) {
    const enabled = new Set((await activationRepo.listAll())
      .filter((row) => row.workspaceId === required.workspaceId && row.enabled).map((row) => row.pluginId));
    return (await discoverActivePlugins())
      .filter((record) => enabled.has(record.id) && declaresProviders({ manifest: record.manifest }))
      .map((record) => ({ pluginId: record.id, providers: record.manifest!.contributes!.providers! }));
  }

  async function loadProviderPlugins({ pluginIds }: { pluginIds: readonly string[] }, options: { timeoutMs?: number } = {}): Promise<readonly string[]> {
    const wanted = new Set(pluginIds);
    if (wanted.size === 0) return [];
    const enabled = new Set((await activationRepo.listAll())
      .filter((row) => row.workspaceId === required.workspaceId && row.enabled).map((row) => row.pluginId));
    const loaded: string[] = [];
    for (const record of await discoverActivePlugins()) {
      if (!wanted.has(record.id) || !enabled.has(record.id) || !declaresProviders({ manifest: record.manifest })) continue;
      selectedProviders.add(record.id);
      try {
        await attachProviderWithin({ record, timeoutMs: options.timeoutMs ?? 10_000 });
        loaded.push(record.id);
      } catch (error) {
        onPluginDisabled(record.id);
        console.warn(`[plugin-runtime] provider plugin '${record.id}' failed to load; its contract stays on the noop: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return loaded;
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

  const pluginInstaller: PluginInstallerPort | undefined = installDir === undefined ? undefined : {
      preview: (input, options = {}) => previewSitePluginInstall({ ...input, deps: { ...pluginHostBinding, ...options, installDir, builtInIds: sources.map((source) => source.manifest.id), builtInManifests: sources.map((source) => source.manifest), repo: activationRepo, conflicts: installPreviewConflicts } }),
      install: async (input, options = {}) => {
        const deps = { ...pluginHostBinding, ...options, installDir, builtInIds: sources.map((source) => source.manifest.id), builtInManifests: sources.map((source) => source.manifest), repo: activationRepo, conflicts: installPreviewConflicts };
        const preview = await previewSitePluginInstall({ ...input, deps });
        // Admission uses this manifest's identity; publication must retain those exact bytes.
        const run = () => installSitePlugin({ ...input, expectedDigest: input.expectedDigest ?? preview.digest, deps });
        const host = required.getPluginHost?.();
        if (!host) return run();
        return host.withInstallIdentity({ candidate: { id: preview.publisherId ?? `unknown/${preview.id}`, localId: preview.id, family: "site-runtime" }, run });
      },
  };
  async function reloadActivation({ row, id, discovery }: {
    row: Awaited<ReturnType<PluginActivationRepoPort["listAll"]>>[number]; id: string; discovery: readonly PluginDiscoveryRecord[];
  }, _options = {}): Promise<void> {
    const here = row.workspaceId === required.workspaceId;
    try {
      await setPluginEnabled({ deps: { clock, repo: activationRepo, discovery,
        onEnabled: here ? onPluginEnabled : async () => {}, onDisabled: here ? onPluginDisabled : () => {} },
        input: { workspaceId: row.workspaceId, pluginId: id, enabled: true } });
    } catch (error) {
      if (here) await restoreReloadedPlugin({ id, workspaceId: row.workspaceId });
      throw error;
    }
  }

  async function assertReloadApproved({ id, enabledCount, discovery }: {
    id: string; enabledCount: number; discovery: readonly PluginDiscoveryRecord[];
  }, _options = {}): Promise<void> {
    // Consent gap (2026-10-12): a re-seal that widens what a running plugin can reach waits for
    // the owner. Thrown here, the source service reports it as reloadError and keeps every
    // retained version; the approved version keeps running until plugins_set_enabled is confirmed.
    const next = discovery.find(record => record.id === id)?.manifest;
    const added = enabledCount > 0 && next ? addedPluginCapabilities({ approved: await pluginSource?.readApproval({ id }, {}), next: pluginCapabilitySet({ manifest: next }) }) : [];
    if (added.length > 0) throw new Error(`PLUGIN_APPROVAL_REQUIRED: this version adds ${added.join(', ')}. The approved version keeps running; ask the owner to approve it by enabling it again with plugins_set_enabled.`);
  }

  async function restoreReloadedPlugin({ id, workspaceId }: { id: string; workspaceId: string }, _options = {}): Promise<void> {
    // setPluginEnabled already restored the old activation row. Re-enter the same loader
    // to pin its retained bytes, rather than turning a working plugin off for a bad update.
    try { await onPluginEnabled(id); }
    catch (rollbackError) {
      console.warn(`[plugin-runtime] Plugin '${id}' restored-version reload failed`, rollbackError);
      onPluginDisabled(id);
      await quarantinePlugin({ deps: quarantineDeps, input: { pluginId: id, workspaceId, consecutiveFailures: 0, reason: 'Source reload and restored-version reload failed; fix the draft or use plugin_source_rollback.' } });
    }
  }

  const pluginSource = composeSourceService({}, {});

  function composeSourceService(_required: Record<string, never>, _options = {}): PluginSourcePort | undefined {
    if (installDir === undefined || pluginInstaller === undefined) return undefined;
    return createPluginSourceService({
      ...pluginHostBinding, installDir, installer: pluginInstaller, policy: pluginSourcePolicy,
      pruneVersions: ({ id }) => pruneSitePluginVersions({ id, installDir, repo: activationRepo }),
      builtInIds: sources.map(source => source.manifest.id),
      // readDefinedPlugin accepts this SDK wrapper ABI; no package imports are needed from an
      // external site's Documents folder. Owner: full server access for now. TODO: sandbox tier-3.
      scaffoldEntry: `export default { definition: { setup(sdk) {
  /* Register declared content filters here.
   * To add the examples below, declare capabilities http.route.register and tools.register,
   * and contributes: { routes: ['GET /hello'], tools: ['echo'] } in tovu.plugin.json.
   * Routes mount at /api/p/<plugin-id>/hello. Widgets use render.contribute and contributes.widgets.
   * sdk.routes.add({ method: 'GET', path: '/hello', access: 'public', handler: () => ({ body: { hello: true } }) });
   * sdk.tools.add({ name: 'echo', description: 'Echo input', inputSchema: { type: 'object' }, handler: ({ input }) => input });
   * sdk.widgets.add({ name: '<declared-widget-name>', render: () => '<strong>Hello</strong>' });
   */
} } };\n`,
      reload: async ({ id }) => {
        const enabled = (await activationRepo.listAll()).filter(row => row.pluginId === id && row.enabled);
        const discovery = await discoverPlugins();
        await assertReloadApproved({ id, enabledCount: enabled.length, discovery });
        // Load here before publishing active pointers to other processes. Their existing poll sees
        // a version change and re-enters the same validated loader, replacing module snapshots.
        enabled.sort((a, b) => Number(b.workspaceId === required.workspaceId) - Number(a.workspaceId === required.workspaceId));
        for (const row of enabled) {
          await reloadActivation({ row, id, discovery });
        }
        return enabled.some(row => row.workspaceId === required.workspaceId);
      },
    });
  }

  return {
    dispose: async (input, options = {}) => {
      closing = true;
      await Promise.allSettled([...pendingAttachments]);
      await snapshots?.dispose(input, options);
    },
    browserProviders: () => ({ generation: browserGeneration, providers: [...browserProviders.values()].flat() }),
    ...(pluginInstaller === undefined ? {} : { pluginInstaller }),
    ...(pluginSource === undefined ? {} : { pluginSource }),
    pluginSourcePolicy,
    pluginLoadedVersion: ({ id }) => loadedVersions.get(id),
    hookRegistry,
    pluginContributions,
    providerContributions,
    loadProviderPlugins,
    listProviderPlugins,
    discoverPlugins,
    onPluginEnabled,
    onPluginDisabled,
    locatePluginPackageDirs,
    readPluginPackageFiles,
    beforeSaveHook: (entry) => hookRegistry.runBeforeSave({ entry }),
    previewPluginBeforeSave: (pluginId, entry) => hookRegistry.previewBeforeSave({ pluginId, entry }),
    attachEnabledPluginsAtBoot,
    listPluginConflicts: () => listPluginConflicts(),
  };
}
