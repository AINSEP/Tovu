/** Host bindings for the member-login admission and credential checks that live in `@jini-ai/user-management`. */
import { createReadyLoginProviderList } from "@jini-ai/user-management/member-login/ready-providers";
import { hasLoginCredentials } from "@jini-ai/user-management/member-login/credentials";
import { describeCredentialByLabel, resolveCustomCredentialByLabel,
  type CustomCredentialResolveDeps } from "../custom-credentials/index.js";
import type { LoadPluginContributions } from "../agent-plugins/lifecycle.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readAgentPluginPortableExtension } from "@jini-ai/agent-plugins/manifest";
import { parseLoginProviders, type LoginProviderPreset } from "@jini-ai/user-management/server";
import { loadBundledLoginProviders as loadBundled, loadLoginProviders as admitLoginProviders, fingerprint, LOGIN_PROVIDERS_FILENAME } from "@jini-ai/user-management/member-login/providers";
import { bundledContributionSources } from "../agent-plugins/bundled-contribution-sources.js";
import { loadPluginContributionsFromSource, type PluginContributionDefinition } from "../agent-plugins/lifecycle.js";
import type { LoginProvider } from "@jini-ai/core/contracts/site/user-management-server";
import { TOVU_AGENT_PLUGIN_IDENTITY_READ } from "../agent-plugins/identity-read-policy.js";

const contribution: PluginContributionDefinition<LoginProviderPreset, LoginProvider> = {
  filename: LOGIN_PROVIDERS_FILENAME, contribution: "member login providers", kind: "data", parse: parseLoginProviders,
  load: ({ descriptor, plugin }) => ({ ...descriptor, pluginId: plugin.pluginId, configurationVersion: fingerprint({ value: descriptor,
    sha256Hex: ({ text }) => createHash("sha256").update(text).digest("hex") }) }),
  onReadError: ({ error }) => (error as NodeJS.ErrnoException).code === "ENOENT" ? [] : undefined,
};

export function loadBundledLoginProviders(required: { sourceRoot: string }, _options = {}) {
  return loadBundled({ ...required, bundledContributionSources, loadPluginContributionsFromSource,
    sha256Hex: ({ text }) => createHash("sha256").update(text).digest("hex"),
    readManifest: async ({ plugin }) => JSON.parse(await readFile(path.join(plugin.packageRoot, "plugin.json"), "utf8")),
    acceptsManifest: ({ manifest, plugin }) => readAgentPluginPortableExtension({ value: manifest }, TOVU_AGENT_PLUGIN_IDENTITY_READ)?.id === `tovu/${plugin.pluginId}`,
  });
}

export function loadLoginProviders(required: { workspaceId: string; loadContributions: LoadPluginContributions; bundledProviders: readonly LoginProvider[] }, _options = {}) {
  return admitLoginProviders({ workspaceId: required.workspaceId, bundledProviders: required.bundledProviders,
    loadCandidates: async ({ workspaceId, trustedPluginIds }) => (await required.loadContributions({ workspaceId, definition: contribution },
      { requireActive: true, orderByPluginId: true,
        packageRefusal: ({ plugin }) => trustedPluginIds.has(plugin.pluginId) ? undefined : "LOGIN_PROVIDER_UNTRUSTED" })).items });
}

/** Name the credential owner's label lookups as the `describe`/`resolve` ports the Jini checks take.
 * Nothing is read or opened here; each call reaches the vault owner only when the check runs.
 * @complexity O(1) construction.
 */
export function loginCredentialPorts(required: { credentials: CustomCredentialResolveDeps }, _optional: Record<string, never> = {}) {
  return {
    describe: (input: { workspaceId: string; label: string }) => describeCredentialByLabel(required.credentials, input),
    resolve: (input: { workspaceId: string; label: string }) => resolveCustomCredentialByLabel(required.credentials, input),
  };
}

/** Re-admit bundled providers and configured credential metadata on every call; nothing is cached
 * at construction, so a replaced or deactivated package is refused on the very next call.
 * @complexity O(p + c) admitted providers and their credential metadata reads.
 */
export function createTovuReadyLoginProviderList(required: {
  sourceRoot: string; loadContributions: LoadPluginContributions; credentials: CustomCredentialResolveDeps;
}, _optional: Record<string, never> = {}) {
  const ports = loginCredentialPorts({ credentials: required.credentials });
  return createReadyLoginProviderList({
    listAdmitted: async ({ workspaceId }) => {
      const bundledProviders = await loadBundledLoginProviders({ sourceRoot: required.sourceRoot });
      return loadLoginProviders({ workspaceId, bundledProviders, loadContributions: required.loadContributions });
    },
    hasCredentials: ({ workspaceId, provider }) => hasLoginCredentials({ deps: ports, workspaceId, provider }),
  });
}
