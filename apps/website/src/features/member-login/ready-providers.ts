/** Shared readiness projection for OIDC routes and public plugin exports; never opens secrets. */
import { loadBundledLoginProviders, loadLoginProviders } from "./providers.js";
import { hasLoginCredentials } from "./credentials.js";
import type { CustomCredentialResolveDeps } from "../custom-credentials/store.js";
import type { LoadPluginContributions } from "../agent-plugins/lifecycle.js";
import type { LoginProvider } from "./types.js";

/** Re-admit bundled providers and configured credential metadata on every call.
 * @complexity O(p + c) admitted providers and their credential metadata reads.
 */
export function createReadyLoginProviderList(required: {
  sourceRoot: string; loadContributions: LoadPluginContributions; credentials: CustomCredentialResolveDeps;
}, _options = {}): (input: { workspaceId: string }, options?: Record<string, never>) => Promise<readonly LoginProvider[]> {
  return async ({ workspaceId }, _options = {}) => {
    const bundledProviders = await loadBundledLoginProviders({ sourceRoot: required.sourceRoot });
    const providers = await loadLoginProviders({ workspaceId, bundledProviders, loadContributions: required.loadContributions });
    const configured = await Promise.all(providers.map(async provider =>
      await hasLoginCredentials({ deps: required.credentials, workspaceId, provider }) ? provider : null));
    return configured.filter(provider => provider !== null);
  };
}
