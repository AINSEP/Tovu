import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveAgentPluginActivation } from "#src/features/agent-plugins/activation";
import { preferBundledAgentPluginDigests, readBundledAgentPluginDigests, type BundledAgentPluginDigests } from "#src/features/agent-plugins/bundled-digests";
import type { InstalledAgentPlugin } from "#src/features/agent-plugins/install";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { assertContainedOnDisk, PackagePathViolation } from "#src/features/agent-plugins/package-paths";
import { listInstalledPlugins } from "#src/features/agent-plugins/resolve-agent-plugin-refs";

import type { HttpClientPort } from "#src/platform/http/index";

import { createSourceControlProviderKit } from "./provider-kit.js";
import type { SourceControlHostFacts, SourceControlProvider, SourceControlProviderKit, SourceControlProviderModule } from "./provider-module.js";

/**
 * @file Loads the git-host providers Agent Plugins contribute — the generic seam that lets a plugin
 * (the bundled `github` one today) add a source-control host without core naming one. Read by
 * `source_control_*`, `site_backup_*`, `custom_credential_write_files` and the admin Source Control
 * credential form.
 *
 * A plugin opts in by shipping {@link SOURCE_CONTROL_PROVIDERS_FILENAME} at its root: a data-only list
 * of `{ id, label, apiOrigin, maxFileBytes?, reservedPaths?, module }`. `id` is the `source_control_credential_sets.provider_id`
 * the provider serves; `label`, `apiOrigin` and `maxFileBytes` are the host facts core copy and checks
 * name (`SourceControlHostFacts`), so no tool text hard-codes a host; `module` is a plain-JS `.mjs` file inside the plugin whose default export is a
 * `SourceControlProviderModule` (`features/source-control/provider-module.ts`).
 *
 * TRUST RULE (fail closed), the same one `features/agent-plugins/mail-adapter-registry.ts` and the
 * deploy-target registry apply: a module runs in this process, so it loads only when the plugin is ACTIVE by the fail-closed
 * reader, its installed digest is the one `bundled-digests.json` records (only plugins Tovu shipped),
 * and the module path stays inside the plugin root and ends in `.mjs`. A bad plugin drops only its
 * own providers and a bad module only itself; every drop is reported in `refusals`, never thrown.
 */

/** The file a plugin ships at its root to contribute git-host providers. */
export const SOURCE_CONTROL_PROVIDERS_FILENAME = "tovu-source-control.json";

const PROVIDER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 64;
const MAX_LABEL_LENGTH = 100;

export interface SourceControlProviderDescriptor extends SourceControlHostFacts {
  /** Plugin-relative path of the `.mjs` module. */
  readonly module: string;
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

interface PackageLoad {
  readonly providers: readonly LoadedSourceControlProvider[];
  readonly refusals: readonly string[];
  /** Provider ids an INACTIVE plugin declares (its JSON read as data; no module imported). */
  readonly switchedOff?: readonly string[];
}

const NOTHING: PackageLoad = { providers: [], refusals: [] };

interface ProviderPackage {
  readonly pluginId: string;
  readonly packageRoot: string;
}

function toRegistry(providers: readonly LoadedSourceControlProvider[], refusals: readonly string[], switchedOff?: ReadonlyMap<string, string>): SourceControlProviderRegistry {
  return { list: () => providers, get: (providerId) => providers.find((provider) => provider.descriptor.id === providerId), refusals, ...(switchedOff ? { switchedOff } : {}) };
}

/**
 * Builds this workspace's git-host provider registry from its installed Agent Plugins. Read fresh on
 * each call; Node caches each module import per file URL, and installed digest directories never change.
 *
 * @throws Nothing for a plugin-level fault; only a filesystem fault listing the package directory itself.
 * @complexity O(p) installed plugins, one small read plus one import per declared provider.
 */
export async function loadSourceControlProviderRegistry(ctx: { readonly workspaceId: string }): Promise<SourceControlProviderRegistry> {
  const layout = resolveAgentPluginLayout().forWorkspace(ctx.workspaceId);
  const bundled = await readBundledAgentPluginDigests(layout.root);
  const installed = preferBundledAgentPluginDigests(await listInstalledPlugins(layout.packages), bundled);

  const providers: LoadedSourceControlProvider[] = [];
  const refusals: string[] = [];
  const switchedOff = new Map<string, string>();
  for (const plugin of [...installed].sort((a, b) => a.pluginId.localeCompare(b.pluginId))) {
    const load = await loadTrustedPlugin(plugin, bundled, layout.root);
    providers.push(...load.providers);
    refusals.push(...load.refusals);
    for (const providerId of load.switchedOff ?? []) if (!switchedOff.has(providerId)) switchedOff.set(providerId, plugin.pluginId);
  }
  return toRegistry(providers, refusals, switchedOff);
}

/**
 * A registry read straight from a plugin's SOURCE directory, with no install, activation or digest
 * gate. For tests only, where the directory is this product's own `content/agent-plugins/<id>/`.
 *
 * @complexity O(n) providers, one import each.
 */
export async function loadSourceControlProviderRegistryFromSource(plugin: ProviderPackage): Promise<SourceControlProviderRegistry> {
  const load = await loadPackageProviders(plugin);
  return toRegistry(load.providers, load.refusals);
}

/** One installed plugin's contribution, after the activation and bundled-digest gates. @complexity O(n). */
async function loadTrustedPlugin(plugin: InstalledAgentPlugin, bundled: BundledAgentPluginDigests, workspaceRoot: string): Promise<PackageLoad> {
  if (!plugin.files.includes(SOURCE_CONTROL_PROVIDERS_FILENAME)) return NOTHING;
  const refuse = (reason: string): PackageLoad => ({ providers: [], refusals: [`source-control providers from '${plugin.pluginId}' were not loaded: ${reason}`] });

  const activation = await resolveAgentPluginActivation(workspaceRoot, plugin.pluginId);
  if (activation.verdict === "inactive") return { ...NOTHING, switchedOff: await declaredProviderIds(plugin) };
  if (activation.verdict === "undetermined") return refuse(`its activation could not be read (${activation.reason})`);

  if (bundled.get(plugin.pluginId) !== plugin.archiveDigest) {
    return refuse(`only plugins shipped with Tovu may add source-control providers (installed digest ${plugin.archiveDigest.slice(0, 12)} is not the one this build shipped)`);
  }
  return loadPackageProviders(plugin);
}

/** The provider ids a package declares, read as data only; none when its file is invalid. @complexity O(n). */
async function declaredProviderIds(plugin: ProviderPackage): Promise<readonly string[]> {
  const parsed = parseSourceControlProvidersFile(await readFile(path.join(plugin.packageRoot, SOURCE_CONTROL_PROVIDERS_FILENAME), "utf8"));
  return parsed.ok ? parsed.descriptors.map((descriptor) => descriptor.id) : [];
}

/** A package's own providers, trusted by the caller. @complexity O(n) providers, one import each. */
async function loadPackageProviders(plugin: ProviderPackage): Promise<PackageLoad> {
  const parsed = parseSourceControlProvidersFile(await readFile(path.join(plugin.packageRoot, SOURCE_CONTROL_PROVIDERS_FILENAME), "utf8"));
  if (!parsed.ok) {
    return { providers: [], refusals: [`source-control providers from '${plugin.pluginId}' were not loaded: ${SOURCE_CONTROL_PROVIDERS_FILENAME} is invalid: ${parsed.reason}`] };
  }

  const providers: LoadedSourceControlProvider[] = [];
  const refusals: string[] = [];
  for (const descriptor of parsed.descriptors) {
    const loaded = await loadProviderModule(plugin, descriptor);
    if (typeof loaded === "string") refusals.push(`source-control provider '${descriptor.id}' from '${plugin.pluginId}' was not loaded: ${loaded}`);
    else providers.push({ descriptor, pluginId: plugin.pluginId, module: loaded });
  }
  return { providers, refusals };
}

/** Imports one module after the containment check; the module, or the refusal reason. @complexity O(1). */
async function loadProviderModule(plugin: ProviderPackage, descriptor: SourceControlProviderDescriptor): Promise<SourceControlProviderModule | string> {
  let modulePath: string;
  try {
    modulePath = await assertContainedOnDisk(plugin.packageRoot, descriptor.module);
  } catch (error) {
    if (error instanceof PackagePathViolation) return `module path '${descriptor.module}' escapes the plugin root`;
    throw error;
  }

  let imported: { readonly default?: unknown };
  try {
    imported = (await import(pathToFileURL(modulePath).href)) as { readonly default?: unknown };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const candidate = imported.default;
  if (!isPlainObject(candidate) || typeof candidate.create !== "function") return "its module has no create() function";
  if (candidate.validateTarget !== undefined && typeof candidate.validateTarget !== "function") return "its module's validateTarget is not a function";
  return candidate as unknown as SourceControlProviderModule;
}

/**
 * Parses a plugin's {@link SOURCE_CONTROL_PROVIDERS_FILENAME}. Pure. Unknown keys are ignored.
 *
 * @complexity O(n) in the declared provider count.
 */
export function parseSourceControlProvidersFile(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!isPlainObject(value) || value.schemaVersion !== 1) return { ok: false, reason: "schemaVersion must be 1" };
  if (!Array.isArray(value.providers)) return { ok: false, reason: "providers must be an array" };

  const descriptors: SourceControlProviderDescriptor[] = [];
  for (const [index, entry] of value.providers.entries()) {
    const result = parseDescriptor(entry, `providers[${index}]`);
    if (typeof result === "string") return { ok: false, reason: result };
    if (descriptors.some((seen) => seen.id === result.id)) return { ok: false, reason: `providers[${index}].id '${result.id}' is declared twice` };
    descriptors.push(result);
  }
  return { ok: true, descriptors };
}

/** One descriptor entry, or the reason it is invalid. @complexity O(1). */
function parseDescriptor(entry: unknown, at: string): SourceControlProviderDescriptor | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { id, label, apiOrigin, maxFileBytes, reservedPaths, module } = entry;
  if (typeof id !== "string" || id.length > MAX_ID_LENGTH || !PROVIDER_ID_PATTERN.test(id)) return `${at}.id must be a lowercase hyphenated id`;
  if (typeof label !== "string" || label.trim() === "" || label.length > MAX_LABEL_LENGTH) return `${at}.label must be a non-empty string`;
  if (typeof apiOrigin !== "string" || !isHttpsOrigin(apiOrigin)) return `${at}.apiOrigin must be an https origin with no path`;
  if (maxFileBytes !== undefined && !(Number.isSafeInteger(maxFileBytes) && (maxFileBytes as number) > 0)) return `${at}.maxFileBytes must be a positive integer`;
  if (reservedPaths !== undefined && !isReservedPathList(reservedPaths)) return `${at}.reservedPaths must be a list of at most ${MAX_RESERVED_PATHS} relative folder paths`;
  if (typeof module !== "string" || !module.endsWith(".mjs") || path.posix.isAbsolute(module)) return `${at}.module must be a relative path ending in .mjs`;
  return {
    id,
    label,
    apiOrigin,
    ...(maxFileBytes !== undefined ? { maxFileBytes: maxFileBytes as number } : {}),
    ...(reservedPaths !== undefined ? { reservedPaths } : {}),
    module,
  };
}

const MAX_RESERVED_PATHS = 20;

/** Relative, slash-separated folder paths: no empty, `.` or `..` segment, no leading slash. @complexity O(n). */
function isReservedPathList(value: unknown): value is readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_RESERVED_PATHS) return false;
  return value.every(
    (entry) => typeof entry === "string" && entry.length <= 200 && entry.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
  );
}

/**
 * The reserved path (`SourceControlHostFacts.reservedPaths`) that `folder` is, or sits under, if any.
 * Case-insensitive, so `.GitHub` is refused as well as `.github`.
 *
 * @complexity O(r) reserved paths.
 */
export function findReservedPath(folder: string, reservedPaths: readonly string[] | undefined): string | undefined {
  const lower = folder.toLowerCase();
  return reservedPaths?.find((reserved) => {
    const reservedLower = reserved.toLowerCase();
    return lower === reservedLower || lower.startsWith(`${reservedLower}/`);
  });
}

/** True for `https://host[:port]` exactly — what `new URL(x).origin` gives back. @complexity O(1). */
function isHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value;
  } catch {
    return false;
  }
}

/** A loaded provider built over `kit`, carrying its plugin's declared host facts. @complexity O(1). */
export function buildLoadedSourceControlProvider(loaded: LoadedSourceControlProvider, kit: SourceControlProviderKit): SourceControlProvider {
  const { id, label, apiOrigin, maxFileBytes, reservedPaths } = loaded.descriptor;
  return {
    ...loaded.module.create({ kit }),
    id,
    label,
    apiOrigin,
    ...(maxFileBytes !== undefined ? { maxFileBytes } : {}),
    ...(reservedPaths !== undefined ? { reservedPaths } : {}),
  };
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Loads a workspace's provider registry; injected so a test can read the plugin from source. */
export type LoadSourceControlProviders = (workspaceId: string) => Promise<SourceControlProviderRegistry>;

/** The installed, enabled, Tovu-shipped providers ({@link loadSourceControlProviderRegistry}). */
export const loadInstalledSourceControlProviders: LoadSourceControlProviders = (workspaceId) => loadSourceControlProviderRegistry({ workspaceId });

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
    readonly load?: LoadSourceControlProviders;
    readonly workspaceId: string;
    readonly providerId: string;
    readonly httpClient?: HttpClientPort;
    readonly fetchFn?: typeof fetch;
  },
): Promise<BuildSourceControlProviderResult> {
  const registry = await (input.load ?? loadInstalledSourceControlProviders)(input.workspaceId);
  const loaded = registry.get(input.providerId);
  if (!loaded) return { ok: false, message: noSourceControlProviderMessage(registry, input.providerId), refusals: registry.refusals };
  const kit = createSourceControlProviderKit({ ...(input.httpClient ? { httpClient: input.httpClient } : {}), ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}) });
  return { ok: true, provider: buildLoadedSourceControlProvider(loaded, kit) };
}

/**
 * Every loaded provider, built over one guarded HTTP client.
 *
 * @complexity One registry load plus one `create()` per loaded provider.
 */
export async function buildSourceControlProviders(input: {
  readonly load?: LoadSourceControlProviders;
  readonly workspaceId: string;
  readonly httpClient: HttpClientPort;
}): Promise<{ readonly providers: readonly SourceControlProvider[]; readonly refusals: readonly string[]; readonly noProviderMessage: string }> {
  const registry = await (input.load ?? loadInstalledSourceControlProviders)(input.workspaceId);
  const kit = createSourceControlProviderKit({ httpClient: input.httpClient });
  return { providers: registry.list().map((loaded) => buildLoadedSourceControlProvider(loaded, kit)), refusals: registry.refusals, noProviderMessage: noSourceControlProviderMessage(registry) };
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
  const origin = originOf(baseUrl);
  const match = providers.find((provider) => originOf(provider.apiOrigin) === origin) ?? (providers.length === 1 ? providers[0] : undefined);
  if (match) return { ok: true, provider: match };
  return {
    ok: false,
    message:
      providers.length === 0
        ? noProviderMessage
        : `No enabled Agent Plugin provides source control for ${origin ?? baseUrl}.`,
  };
}

/** {@link buildSourceControlProviders} then {@link pickSourceControlProviderForApi}. @complexity As those. */
export async function buildSourceControlProviderForApi(input: {
  readonly load?: LoadSourceControlProviders;
  readonly workspaceId: string;
  readonly baseUrl: string;
  readonly httpClient: HttpClientPort;
}): Promise<BuildSourceControlProviderResult> {
  const built = await buildSourceControlProviders(input);
  const picked = pickSourceControlProviderForApi(built.providers, input.baseUrl, built.noProviderMessage);
  return picked.ok ? picked : { ...picked, refusals: built.refusals };
}

/** The origin of `url`, or `undefined` when it does not parse. */
export function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
