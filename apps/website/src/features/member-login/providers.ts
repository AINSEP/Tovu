/** Active bundled data contributions only: an arbitrary issuer can impersonate any inbox. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readAgentPluginPortableExtension } from "@jini-ai/agent-plugins/manifest";
import { parseLoginProviders as parseLoginProviderPresets } from "@jini-ai/user-management/server";
import { bundledContributionSources } from "../agent-plugins/bundled-contribution-sources.js";
import { loadPluginContributionsFromSource, type LoadPluginContributions,
  type PluginContributionDefinition } from "../agent-plugins/lifecycle.js";
import type { LoginProvider, LoginProviderPreset } from "./types.js";

export const LOGIN_PROVIDERS_FILENAME = "tovu-login-providers.json";

/** Parse a bounded v1 preset file. Failure exposes a fixed code, never raw plugin JSON.
 * The parser lives in `@jini-ai/user-management/server`; this keeps the host's name and signature.
 * @complexity O(bytes + p), bounded to 32 KiB and eight providers per package.
 */
export function parseLoginProviders(required: { raw: string }, _options = {}):
  { ok: true; descriptors: readonly LoginProviderPreset[] } | { ok: false; reason: string } {
  return parseLoginProviderPresets({ raw: required.raw });
}

function fingerprint(value: LoginProviderPreset): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const contribution: PluginContributionDefinition<LoginProviderPreset, LoginProvider> = {
  filename: LOGIN_PROVIDERS_FILENAME, contribution: "member login providers", kind: "data", parse: parseLoginProviders,
  load: ({ descriptor, plugin }) => ({ ...descriptor, pluginId: plugin.pluginId, configurationVersion: fingerprint(descriptor) }),
  onReadError: ({ error }) => (error as NodeJS.ErrnoException).code === "ENOENT" ? [] : undefined,
};

/** Read only the product-owned bundle catalog root, never a workspace-installed package root.
 * Manifest namespace and the lifecycle's contained source reader establish the pinned presets.
 * @throws I/O errors for a broken shipped catalog; fails closed rather than trusting installed data.
 * @complexity O(p) bundled packages, two small file reads per provider package.
 */
export async function loadBundledLoginProviders(required: { sourceRoot: string }, _options = {}): Promise<readonly LoginProvider[]> {
  const items: LoginProvider[] = [];
  for (const plugin of bundledContributionSources({ sourceRoot: required.sourceRoot, filename: LOGIN_PROVIDERS_FILENAME })) {
    const manifest = JSON.parse(await readFile(path.join(plugin.packageRoot, "plugin.json"), "utf8"));
    if (readAgentPluginPortableExtension({ value: manifest })?.id !== `tovu/${plugin.pluginId}`) continue;
    const loaded = await loadPluginContributionsFromSource({ plugin, definition: contribution });
    items.push(...loaded.items);
  }
  return items;
}

/** Reload activation/digest admission on start AND callback; compare the entire preset with the
 * shipped one. A trusted-looking installed id alone must never select an issuer or JWKS URL.
 * @returns Unique admitted providers only; duplicated ids are refused in full.
 * @complexity O(p + b), installed and bundled provider counts; no per-member queries.
 */
export async function loadLoginProviders(required: {
  workspaceId: string; loadContributions: LoadPluginContributions; bundledProviders: readonly LoginProvider[];
}, _options = {}): Promise<readonly LoginProvider[]> {
  const pins = new Map(required.bundledProviders.map(provider => [`${provider.pluginId}:${provider.id}`, provider]));
  const pluginIds = new Set(required.bundledProviders.map(provider => provider.pluginId));
  const loaded = await required.loadContributions({ workspaceId: required.workspaceId, definition: contribution }, { requireActive: true, orderByPluginId: true,
    packageRefusal: ({ plugin }) => pluginIds.has(plugin.pluginId) ? undefined : "LOGIN_PROVIDER_UNTRUSTED" });
  const admitted = loaded.items.filter(provider => pins.get(`${provider.pluginId}:${provider.id}`)?.configurationVersion === provider.configurationVersion);
  const counts = new Map<string, number>();
  for (const provider of admitted) counts.set(provider.id, (counts.get(provider.id) ?? 0) + 1);
  return admitted.filter(provider => counts.get(provider.id) === 1);
}
