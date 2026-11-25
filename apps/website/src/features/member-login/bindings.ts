/** Host bindings for the member-login admission and credential checks that live in `@jini-ai/user-management`. */
import { createReadyLoginProviderList } from "@jini-ai/user-management/member-login/ready-providers";
import { hasLoginCredentials } from "@jini-ai/user-management/member-login/credentials";
import { describeCredentialByLabel, resolveCustomCredentialByLabel,
  type CustomCredentialResolveDeps } from "../custom-credentials/index.js";
import type { LoadPluginContributions } from "../agent-plugins/lifecycle.js";
import { loadBundledLoginProviders, loadLoginProviders } from "./providers.js";

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
