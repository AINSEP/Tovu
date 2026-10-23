import path from "node:path";
import { bundledContributionSources } from "../agent-plugins/bundled-contribution-sources.js";
import * as sourceControl from "@jini-ai/devops/source-control";

import { parseDescriptorI18n, type DescriptorI18n } from "#src/features/agent-plugins/descriptor-i18n";
import { defineExecutablePluginContribution, type LoadPluginContributions, loadPluginContributionsFromSource, readTrustedPluginFile, type TrustedPluginPackage } from "../agent-plugins/lifecycle.js";

import type { HttpClientPort } from "#src/platform/http/index";
import type { ObservabilityPort } from "#src/platform/observability/index";

import { parseSourceControlCredentialForm, type SourceControlCredentialForm } from "./credential-form.js";
import { createSourceControlProviderKit } from "./provider-kit.js";
import type { SourceControlHostFacts, SourceControlProvider, SourceControlProviderKit, SourceControlProviderModule } from "./provider-module.js";

/**
 * @file Loads the git-host providers Agent Plugins contribute — the generic seam that lets a plugin
 * add a source-control host without core naming one. Read by
 * `source_control_*`, `site_backup_*`, `custom_credential_write_files` and the admin Source Control
 * credential form.
 *
 * A plugin opts in by shipping {@link SOURCE_CONTROL_PROVIDERS_FILENAME} at its root: a data-only list
 * of `{ id, label, apiOrigin, maxFileBytes?, reservedPaths?, workflowPaths?, module, credential?, i18n? }` (`credential`: the
 * admin's saved-credential form, `./credential-form.ts`). `id` is the `source_control_credential_sets.provider_id`
 * the provider serves; `label`, `apiOrigin` and `maxFileBytes` are the host facts core copy and checks
 * name (`SourceControlHostFacts`), so no tool text hard-codes a host; `module` is a plain-JS `.mjs` file inside the plugin whose default export is a
 * `SourceControlProviderModule` (`features/source-control/provider-module.ts`).
 *
 * TRUST RULE (fail closed), the shared gate in `features/agent-plugins/trusted-plugin-files.ts`: a
 * module runs in this process, so it loads only when the plugin is ACTIVE by the fail-closed reader, its installed digest is the one `bundled-digests.json` records (only plugins Tovu shipped),
 * and the module path stays inside the plugin root and ends in `.mjs`. A bad plugin drops only its
 * own providers and a bad module only itself; every drop is reported in `refusals`, never thrown.
 */

/** The file a plugin ships at its root to contribute git-host providers. */
export const SOURCE_CONTROL_PROVIDERS_FILENAME = "tovu-source-control.json";

export interface SourceControlProviderDescriptor extends SourceControlHostFacts {
  /** Plugin-relative path of the `.mjs` module. */
  readonly module: string;
  /** The admin's saved-credential form for this host (`./credential-form.ts`). */
  readonly credential?: SourceControlCredentialForm;
  /** Translations of this host's own person-facing text, keyed by locale then by the English string
   *  (`features/agent-plugins/descriptor-i18n.ts`). Absent: English only. */
  readonly i18n?: DescriptorI18n;
}

export interface LoadedSourceControlProvider {
  readonly descriptor: SourceControlProviderDescriptor;
  readonly pluginId: string;
  readonly module: SourceControlProviderModule;
}

export interface SourceControlProviderRegistry {
  /** Every loaded provider, in a stable order (plugin id, then declaration order). */
  list(): readonly LoadedSourceControlProvider[];
  /** The first loaded provider serving `providerId`, if any. */
  get(providerId: string): LoadedSourceControlProvider | undefined;
  /** Log-safe, one sentence per plugin or provider that was NOT loaded, and why. */
  readonly refusals: readonly string[];
  /** Provider id -> id of the installed plugin that declares it but is switched off, so a refusal can
   *  say exactly which plugin to turn back on. Absent on a registry read from source. */
  readonly switchedOff?: ReadonlyMap<string, string>;
}

type ParseResult = { readonly ok: true; readonly descriptors: readonly SourceControlProviderDescriptor[] } | { readonly ok: false; readonly reason: string };

const providerContribution = defineExecutablePluginContribution<SourceControlProviderDescriptor, SourceControlProviderModule>({
  filename: SOURCE_CONTROL_PROVIDERS_FILENAME, contribution: "source-control providers",
  parse: ({ raw }) => parseSourceControlProvidersFile(raw), modulePath: ({ descriptor }) => descriptor.module,
  validate: ({ exported }) => asProviderModule(exported),
  refusal: ({ plugin, descriptor, reason }) => `source-control provider '${descriptor.id}' from '${plugin.pluginId}' was not loaded: ${reason}`,
});

type ProviderPackage = TrustedPluginPackage;

function toRegistry(providers: readonly LoadedSourceControlProvider[], refusals: readonly string[], switchedOff?: ReadonlyMap<string, string>): SourceControlProviderRegistry {
  return { list: () => providers, get: (providerId) => providers.find((provider) => provider.descriptor.id === providerId), refusals, ...(switchedOff ? { switchedOff } : {}) };
}

/**
 * Builds this workspace's git-host provider registry from its installed Agent Plugins. Read fresh on
 * each call; Node caches each module import per file URL, and installed digest directories never change.
 *
 * @throws Nothing for a plugin-level fault; only a filesystem fault listing the package directory itself.
 * @param required - Contribution loader from this boot's lifecycle; no site-dependent module default.
 * @complexity O(p) installed plugins, one small read plus one import per declared provider.
 */
export async function loadSourceControlProviderRegistry(ctx: { readonly workspaceId: string }, required: { readonly loadContributions: LoadPluginContributions }): Promise<SourceControlProviderRegistry> {
  const switchedOff = new Map<string, string>();
  const load = await required.loadContributions({ ...ctx, definition: providerContribution }, {
    orderByPluginId: true,
    // A switched-off plugin's JSON is read as data (no module imported) so a refusal can name it.
    onInactive: async ({ plugin }) => {
      for (const providerId of await declaredProviderIds(plugin)) if (!switchedOff.has(providerId)) switchedOff.set(providerId, plugin.pluginId);
    },
  });

  return toRegistry(load.items, load.refusals, switchedOff);
}

/**
 * A registry read straight from a plugin's SOURCE directory, with no install, activation or digest
 * gate. For tests only, where the directory is this product's own `content/agent-plugins/<id>/`.
 *
 * @complexity O(n) providers, one import each.
 */
export async function loadSourceControlProviderRegistryFromSource(plugin: ProviderPackage, _optional: Record<string, never> = {}): Promise<SourceControlProviderRegistry> {
  const load = await loadPluginContributionsFromSource({ plugin, definition: providerContribution });
  return toRegistry(load.items, load.refusals);
}

/** Read all product-owned sources lazily, following the existing bundled contribution loader.
 * Missing/malformed packages refuse only themselves. No module executes during app construction.
 * @param required Product payload root, never an operator-writable installation directory.
 * @param optional Source enumeration/loading ports for hermetic tests.
 * @returns Loaded providers and log-safe refusals, with ambiguous ids refused.
 * @complexity O(p log p + n) time, O(p + n) space, plus category reads/imports for p packages and n providers. */
export async function loadBundledSourceControlProviderRegistry(
  required: { readonly sourceRoot: string },
  optional: { sources?: typeof bundledContributionSources; load?: typeof loadSourceControlProviderRegistryFromSource } = {},
): Promise<SourceControlProviderRegistry> {
  let sources: readonly TrustedPluginPackage[];
  try { sources = (optional.sources ?? bundledContributionSources)({ ...required, filename: SOURCE_CONTROL_PROVIDERS_FILENAME }); }
  catch { return toRegistry([], ['bundled source-control provider sources could not be read']); }
  const providers = new Map<string, LoadedSourceControlProvider>();
  const duplicates = new Set<string>();
  const refusals: string[] = [];
  for (const plugin of sources) {
    let registry: SourceControlProviderRegistry;
    try { registry = await (optional.load ?? loadSourceControlProviderRegistryFromSource)(plugin); }
    catch {
      // Import/read errors can contain paths or credentials; report only the product-owned id.
      refusals.push(`source-control provider package '${plugin.pluginId}' was not loaded: package could not be read or imported`);
      continue;
    }
    refusals.push(...registry.refusals);
    for (const provider of registry.list()) {
      if (providers.has(provider.descriptor.id)) duplicates.add(provider.descriptor.id);
      providers.set(provider.descriptor.id, provider);
    }
  }
  for (const id of duplicates) {
    providers.delete(id);
    refusals.push(`source-control provider '${id}' was not loaded: declared more than once`);
  }
  return toRegistry([...providers.values()], refusals);
}

/** The provider ids a package declares, read as data only; none when its file is invalid. @complexity O(n). */
async function declaredProviderIds(plugin: ProviderPackage): Promise<readonly string[]> {
  const parsed = parseSourceControlProvidersFile(await readTrustedPluginFile(plugin, SOURCE_CONTROL_PROVIDERS_FILENAME));
  return parsed.ok ? parsed.descriptors.map((descriptor) => descriptor.id) : [];
}

/** Validate the default export after Jini's contained import. @complexity O(1). */
function asProviderModule(candidate: unknown): SourceControlProviderModule | string {
  return sourceControl.sourceControlProviderModuleError({ value: candidate }) ?? candidate as SourceControlProviderModule;
}

/**
 * Parses a plugin's {@link SOURCE_CONTROL_PROVIDERS_FILENAME}. Pure. Unknown keys are ignored.
 *
 * @complexity O(n) in the declared provider count.
 */
export function parseSourceControlProvidersFile(raw: string): ParseResult {
  return sourceControl.parseSourceControlProvidersFile({ raw, readExtensions: ({ entry, at }) => {
    const credential = parseSourceControlCredentialForm(entry.credential, `${at}.credential`);
    const i18n = parseDescriptorI18n(entry.i18n, `${at}.i18n`);
    if (typeof credential === "string") return { ok: false, reason: credential };
    if (typeof i18n === "string") return { ok: false, reason: i18n };
    return { ok: true, extensions: { ...(credential ? { credential } : {}), ...(i18n ? { i18n } : {}) } };
  } }, {
    modulePath: ({ path: modulePath }) => !path.posix.isAbsolute(modulePath),
    /** Relative, slash-separated folder paths: no empty, `.` or `..` segment, no leading slash. @complexity O(n). */
    folderPath: ({ path: folderPath }) => folderPath.split("/").every(segment => segment !== "" && segment !== "." && segment !== ".."),
  }) as ParseResult;
}

/**
 * The reserved path (`SourceControlHostFacts.reservedPaths`) that `folder` is, or sits under, if any.
 * Case-insensitive, so `.GitHub` is refused as well as `.github`.
 *
 * @complexity O(r) reserved paths.
 */
export function findReservedPath(folder: string, reservedPaths: readonly string[] | undefined): string | undefined {
  return sourceControl.findReservedPath({ folder }, { reservedPaths });
}

/**
 * True when `filePath` (normalized, repository-relative) sits under one of the host's
 * `SourceControlHostFacts.workflowPaths`. Exact and case-sensitive, from the repository root: the
 * host runs only files at that exact path, so this never over- or under-matches what controls CI.
 *
 * @complexity O(w) workflow paths.
 */
export function isUnderWorkflowPath(filePath: string, workflowPaths: readonly string[] | undefined): boolean {
  return sourceControl.isUnderWorkflowPath({ filePath }, { workflowPaths });
}

/** A loaded provider built over `kit`, carrying its plugin's declared host facts and its module's
 *  `validateTarget`. @complexity O(1). */
export function buildLoadedSourceControlProvider(loaded: LoadedSourceControlProvider, kit: SourceControlProviderKit): SourceControlProvider {
  return sourceControl.buildLoadedSourceControlProvider<SourceControlProviderKit, import("./provider-module.js").SourceControlProviderOperations>({ loaded, kit });
}

/** Loads a workspace's provider registry; injected so a test can read the plugin from source. */
export type LoadSourceControlProviders = (workspaceId: string) => Promise<SourceControlProviderRegistry>;

export type BuildSourceControlProviderResult =
  | { readonly ok: true; readonly provider: SourceControlProvider }
  | { readonly ok: false; readonly message: string; readonly refusals: readonly string[] };

/**
 * The built provider serving `providerId` for this workspace, or why there is none. The message is
 * caller-safe; `refusals` (why a plugin did not load) are for the server log.
 *
 * @complexity One registry load, see {@link loadSourceControlProviderRegistry}.
 */
export async function buildSourceControlProvider(
  input: {
    readonly load: LoadSourceControlProviders;
    readonly workspaceId: string;
    readonly providerId: string;
    readonly httpClient?: HttpClientPort;
    readonly fetchFn?: typeof fetch;
    readonly observability?: ObservabilityPort;
  },
): Promise<BuildSourceControlProviderResult> {
  return sourceControl.buildSourceControlProvider<SourceControlProviderKit, import("./provider-module.js").SourceControlProviderOperations, ReturnType<typeof sharedRegistry>>({
    ...input, kit: createSourceControlProviderKit(input),
    load: async ({ workspaceId }) => sharedRegistry(await input.load(workspaceId)),
    noProviderMessage: ({ registry, providerId }) => noSourceControlProviderMessage(registry, providerId),
  });
}

/**
 * Every loaded provider, built over one guarded HTTP client.
 *
 * @complexity One registry load plus one `create()` per loaded provider.
 */
export async function buildSourceControlProviders(input: {
  readonly load: LoadSourceControlProviders;
  readonly workspaceId: string;
  readonly httpClient: HttpClientPort;
  readonly observability?: ObservabilityPort;
  /** Replaces the providers' retry timer (tests). */
  readonly sleep?: (ms: number) => Promise<void>;
}): Promise<{ readonly providers: readonly SourceControlProvider[]; readonly refusals: readonly string[]; readonly noProviderMessage: string }> {
  return sourceControl.buildSourceControlProviders<SourceControlProviderKit, import("./provider-module.js").SourceControlProviderOperations, ReturnType<typeof sharedRegistry>>({
    ...input, kit: createSourceControlProviderKit(input),
    load: async ({ workspaceId }) => sharedRegistry(await input.load(workspaceId)),
    noProviderMessage: ({ registry }) => noSourceControlProviderMessage(registry),
  });
}

/** Where an operator switches an Agent Plugin on or off, as the admin navigation names it. */
const AGENT_PLUGINS_SCREEN = "the admin's Add-Ons > Agent Plugins screen";

/**
 * Why no provider serves `providerId` (or, without one, why there is no provider at all), naming the
 * switched-off plugin and the screen that turns it back on whenever the registry knows it.
 *
 * @complexity O(p) switched-off providers.
 */
export function noSourceControlProviderMessage(registry: Pick<SourceControlProviderRegistry, "switchedOff">, providerId?: string): string {
  const subject = providerId === undefined ? "source control" : `'${providerId}' source control`;
  const plugins = providerId === undefined ? [...new Set(registry.switchedOff?.values() ?? [])] : [registry.switchedOff?.get(providerId)].filter((id): id is string => id !== undefined);
  if (plugins.length === 0) {
    return `No enabled Agent Plugin provides ${subject}, and no installed one declares it. Open ${AGENT_PLUGINS_SCREEN} to install or turn on a plugin that provides it.`;
  }
  return `No enabled Agent Plugin provides ${subject}: ${switchedOffPluginSentence(...plugins)}`;
}

/** "the 'x' Agent Plugin is switched off. To switch it back on, open ... and turn on 'x'." @complexity O(p). */
export function switchedOffPluginSentence(...pluginIds: readonly string[]): string {
  const name = pluginIds.map((id) => `'${id}'`).join(" or ");
  return `the ${name} Agent Plugin is switched off. To switch it back on, open ${AGENT_PLUGINS_SCREEN} and turn on ${name}.`;
}

/**
 * The provider for a saved custom credential's API base URL: the one whose `apiOrigin` is that
 * origin, else the only one there is (a self-hosted host under its own origin), else why none fits.
 *
 * @complexity O(p) providers.
 */
export function pickSourceControlProviderForApi(
  providers: readonly SourceControlProvider[],
  baseUrl: string,
  noProviderMessage: string = noSourceControlProviderMessage({}),
): { ok: true; provider: SourceControlProvider } | { ok: false; message: string } {
  return sourceControl.pickSourceControlProviderForApi({ providers, baseUrl, noProviderMessage }, {
    missingProviderMessage: ({ origin, baseUrl }) => `No enabled Agent Plugin provides source control for ${origin ?? baseUrl}.`,
  });
}

/** {@link buildSourceControlProviders} then {@link pickSourceControlProviderForApi}. @complexity As those. */
export async function buildSourceControlProviderForApi(input: {
  readonly load: LoadSourceControlProviders;
  readonly workspaceId: string;
  readonly baseUrl: string;
  readonly httpClient: HttpClientPort;
  readonly observability?: ObservabilityPort;
}): Promise<BuildSourceControlProviderResult> {
  return sourceControl.buildSourceControlProviderForApi<SourceControlProviderKit, import("./provider-module.js").SourceControlProviderOperations, ReturnType<typeof sharedRegistry>>({
    ...input, kit: createSourceControlProviderKit(input),
    load: async ({ workspaceId }) => sharedRegistry(await input.load(workspaceId)),
    noProviderMessage: ({ registry }) => noSourceControlProviderMessage(registry),
  }, { missingProviderMessage: ({ origin, baseUrl }) => `No enabled Agent Plugin provides source control for ${origin ?? baseUrl}.` });
}

/** The origin of `url`, or `undefined` when it does not parse. */
export function originOf(url: string): string | undefined { return sourceControl.originOf({ url }); }

/** Adapt the installed-plugin ABI without changing provider operation signatures. */
function sharedRegistry(registry: SourceControlProviderRegistry) {
  return { ...registry, list: (_required: Record<string, never>) => registry.list(), get: ({ providerId }: { providerId: string }) => registry.get(providerId) };
}
