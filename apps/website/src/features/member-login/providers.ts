import { loadLoginProviders as admitLoginProviders } from "@jini-ai/user-management/member-login/providers";
/** Active bundled data contributions only: an arbitrary issuer can impersonate any inbox. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readAgentPluginPortableExtension } from "@jini-ai/agent-plugins/manifest";
import { parseLoginProviders } from "@jini-ai/user-management/server";
import { bundledContributionSources } from "../agent-plugins/bundled-contribution-sources.js";
import { loadPluginContributionsFromSource, type LoadPluginContributions,
  type PluginContributionDefinition } from "../agent-plugins/lifecycle.js";
import type { LoginProviderPreset } from "@jini-ai/user-management/server";
import type { LoginProvider } from "@jini-ai/core/contracts/site/user-management-server";

export const LOGIN_PROVIDERS_FILENAME = "jini-login-providers.json";

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
  return admitLoginProviders({ workspaceId: required.workspaceId, bundledProviders: required.bundledProviders,
    loadCandidates: async ({ workspaceId, trustedPluginIds }) => {
      const loaded = await required.loadContributions({ workspaceId, definition: contribution }, { requireActive: true, orderByPluginId: true,
        packageRefusal: ({ plugin }) => trustedPluginIds.has(plugin.pluginId) ? undefined : "LOGIN_PROVIDER_UNTRUSTED" });
      return loaded.items;
    } });
}
