import { readFileSync } from "node:fs";
import path from "node:path";

import { contributeProviders, defineProviderContribution, type ProviderContributionDescriptor } from "@jini-ai/agent-plugins/lifecycle";
import { createObjectStoreRegistry, OBJECT_STORE_CONTRACT, objectStoreProviderFault, type ObjectStoreProvider } from "@jini-ai/core/object-store";
import type { ProviderRegistry } from "@jini-ai/core/provider-registry";
import { createLocalFsObjectStoreProvider } from "@jini-ai/platform/object-store";

import { bundledContributionSources } from "../agent-plugins/bundled-contribution-sources.js";
import { loadPluginContributionsFromSource, type LoadPluginContributions } from "../agent-plugins/lifecycle.js";
import type { DeployHostKit } from "../deployments/contracts.js";

/**
 * @file The site's object-store providers: the built-in `local` filesystem provider (the registry
 * default) plus every provider a trusted Agent Plugin contributes through
 * {@link OBJECT_STORES_FILENAME} — today the bundled s3-compatible plugin's `s3_compatible`.
 *
 * Plugin providers load through Jini's `defineProviderContribution`, so a provider module passes the
 * same gates as every executable seam (active plugin, bundled digest, contained `.mjs`); a bad one is
 * a refusal line, never a boot crash. Core owns the generic contract (`@jini-ai/core/object-store`);
 * this file is only Tovu's wiring.
 */

/** The file a plugin ships at its root to contribute object-store providers. */
export const OBJECT_STORES_FILENAME = "tovu-object-stores.json";

/** What a plain-JS provider module cannot import: SigV4 signing, plus optional request tracing. */
export interface ObjectStoreHost {
  readonly createSigV4Client: DeployHostKit["createSigV4Client"];
  readonly wrapFetch?: (fetchFn: typeof fetch) => typeof fetch;
}

export type TovuObjectStoreProvider = ObjectStoreProvider<ObjectStoreHost>;

export interface LoadedObjectStoreRegistry {
  readonly registry: ProviderRegistry<TovuObjectStoreProvider>;
  /** Log-safe, one line per provider that was not loaded and why. */
  readonly refusals: readonly string[];
}

const MAX_LABEL_LENGTH = 100;

export interface ObjectStoreEnvDeclaration {
  readonly providerId: string;
  readonly selector: string;
  readonly settings: Readonly<Record<string, string>>;
  readonly credentialFields: Readonly<Record<string, string>>;
  readonly secret: string;
  readonly required: readonly string[];
}
interface ObjectStoreDescriptor extends ProviderContributionDescriptor {
  readonly env?: Omit<ObjectStoreEnvDeclaration, "providerId">;
}

type ParseResult = { readonly ok: true; readonly descriptors: readonly ObjectStoreDescriptor[] } | { readonly ok: false; readonly reason: string };

const objectStoreContribution = defineProviderContribution<ProviderContributionDescriptor, TovuObjectStoreProvider>({
  contract: OBJECT_STORE_CONTRACT, filename: OBJECT_STORES_FILENAME,
  parse: ({ raw }) => parseObjectStoresFile({ raw }),
  validate: ({ exported }) => objectStoreProviderFault({ provider: exported }) ?? exported as TovuObjectStoreProvider,
});

/**
 * A registry seeded with `local` (rooted at the site's uploads folder), without plugin providers.
 * @complexity O(1).
 */
function seededRegistry(required: { readonly uploadsDir: string }): ProviderRegistry<TovuObjectStoreProvider> {
  return createObjectStoreRegistry<ObjectStoreHost>({}, { seed: [{ id: "local", label: "This server's disk", provider: createLocalFsObjectStoreProvider({ rootDir: required.uploadsDir }) }] });
}

/**
 * This workspace's providers from its installed, activated Agent Plugins. Read fresh per call.
 * @complexity O(p) installed plugins, one import per declared provider.
 */
export async function loadObjectStoreRegistry(
  required: { readonly workspaceId: string; readonly uploadsDir: string; readonly loadContributions: LoadPluginContributions },
  _optional: Record<string, never> = {}
): Promise<LoadedObjectStoreRegistry> {
  const registry = seededRegistry(required);
  const loaded = await required.loadContributions({ workspaceId: required.workspaceId, definition: objectStoreContribution }, { orderByPluginId: true });
  return { registry, refusals: contributeProviders({ registry, loaded }).refusals };
}

/**
 * Providers read straight from this product's own bundled plugin SOURCE (`content/agent-plugins`),
 * with no install/activation gate — for the operator env override, which must not depend on a
 * plugin being switched on, exactly as `TOVU_MEDIA_BLOB_STORE=s3` never did. Never point
 * `sourceRoot` at anything an operator or third party can write.
 * @complexity O(t) bundled providers, one import each.
 */
export async function loadBundledObjectStoreRegistry(
  required: { readonly uploadsDir: string; readonly sourceRoot: string },
  _optional: Record<string, never> = {}
): Promise<LoadedObjectStoreRegistry> {
  const registry = seededRegistry(required);
  const refusals: string[] = [];
  for (const plugin of bundledContributionSources({ sourceRoot: required.sourceRoot, filename: OBJECT_STORES_FILENAME })) {
    const loaded = await loadPluginContributionsFromSource({ plugin, definition: objectStoreContribution });
    refusals.push(...contributeProviders({ registry, loaded }).refusals);
  }
  return { registry, refusals };
}

/**
 * Parses `tovu-object-stores.json`: `{ schemaVersion: 1, providers: [{ id, module, label? }] }`. Ids
 * are checked against the shared grammar by the loader before any module is imported.
 * @complexity O(n) entries.
 */
export function parseObjectStoresFile(required: { readonly raw: string }, _optional: Record<string, never> = {}): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(required.raw);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!isPlainObject(value) || value.schemaVersion !== 1) return { ok: false, reason: "schemaVersion must be 1" };
  if (!Array.isArray(value.providers)) return { ok: false, reason: "providers must be an array" };
  const descriptors: ObjectStoreDescriptor[] = [];
  for (const [index, entry] of value.providers.entries()) {
    const result = parseDescriptor({ entry, at: `providers[${index}]` });
    if (typeof result === "string") return { ok: false, reason: result };
    if (descriptors.some((seen) => seen.id === result.id)) return { ok: false, reason: `providers[${index}].id '${result.id}' is declared twice` };
    descriptors.push(result);
  }
  return { ok: true, descriptors };
}

/** One manifest entry, or why it is malformed. @complexity O(1). */
function parseDescriptor({ entry, at }: { entry: unknown; at: string }, _optional = {}): ObjectStoreDescriptor | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { id, label, module } = entry;
  if (typeof id !== "string") return `${at}.id must be a string`;
  if (typeof module !== "string" || !module.endsWith(".mjs") || path.posix.isAbsolute(module)) return `${at}.module must be a relative path ending in .mjs`;
  const extra = descriptorMetadata({ label, env: entry.env, at });
  if (typeof extra === "string") return extra;
  return { id, module, ...extra };
}

/** Optional metadata shares the provider declaration's validation and refusal policy. */
function descriptorMetadata({ label, env, at }: { label: unknown; env: unknown; at: string }, _optional = {}): Pick<ObjectStoreDescriptor, "label" | "env"> | string {
  if (label !== undefined && (typeof label !== "string" || label.trim() === "" || label.length > MAX_LABEL_LENGTH)) return `${at}.label must be a non-empty string of at most ${MAX_LABEL_LENGTH} characters`;
  if (env !== undefined && !validEnvDeclaration({ value: env })) return `${at}.env must declare a selector, env maps, secret and ordered required variables`;
  return { ...(label === undefined ? {} : { label: label as string }), ...(env === undefined ? {} : { env: env as ObjectStoreDescriptor["env"] }) };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function envMap(value: unknown): value is Readonly<Record<string, string>> {
  return isPlainObject(value) && Object.values(value).every(envName);
}
function envName(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(value);
}
function envSelector(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]*$/.test(value) && value !== "local";
}
function validEnvDeclaration({ value }: { value: unknown }, _optional = {}): boolean {
  if (!isPlainObject(value)) return false;
  if (!envSelector(value.selector)) return false;
  if (!envMap(value.settings) || !envMap(value.credentialFields) || !envName(value.secret)) return false;
  return Array.isArray(value.required) && value.required.length > 0 && value.required.every(envName);
}

/** Synchronous media env mappings from immutable bundled sources; never imports provider modules.
 * @param required Product-owned source root. @returns Mappings in declaration order.
 * @throws {Error} Unreadable/invalid data or duplicate selectors; an opt-in never silently becomes local. */
export function readBundledObjectStoreEnvDeclarations(required: { readonly sourceRoot: string }, _optional = {}): readonly ObjectStoreEnvDeclaration[] {
  const entries: ObjectStoreEnvDeclaration[] = [];
  for (const plugin of bundledContributionSources({ ...required, filename: OBJECT_STORES_FILENAME })) {
    const parsed = parseObjectStoresFile({ raw: readFileSync(path.join(plugin.packageRoot, OBJECT_STORES_FILENAME), "utf8") });
    if (!parsed.ok) throw new Error(`Object store env declarations from '${plugin.pluginId}' were not loaded: ${parsed.reason}`);
    appendDeclaredEnvironments({ descriptors: parsed.descriptors, entries });
  }
  const selectors = new Set<string>();
  for (const entry of entries) {
    if (selectors.has(entry.selector)) throw new Error(`Object store env selector '${entry.selector}' is declared twice.`);
    selectors.add(entry.selector);
  }
  return entries;
}

function appendDeclaredEnvironments({ descriptors, entries }: { descriptors: readonly ObjectStoreDescriptor[]; entries: ObjectStoreEnvDeclaration[] }, _options = {}): void {
  for (const descriptor of descriptors) {
    if (descriptor.env) entries.push({ ...descriptor.env, providerId: descriptor.id });
  }
}
