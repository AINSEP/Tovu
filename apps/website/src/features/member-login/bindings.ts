import { describeCredentialByLabel, resolveCustomCredentialByLabel, type CustomCredentialResolveDeps } from "../custom-credentials/index.js";
import type { LoadPluginContributions } from "../agent-plugins/lifecycle.js";
import { hasLoginCredentials } from "@jini-ai/user-management/member-login/credentials";
import { createReadyLoginProviderList } from "@jini-ai/user-management/member-login/ready-providers";
import { loadBundledLoginProviders, loadLoginProviders } from "./providers.js";

export function loginCredentialPorts({ credentials }: { credentials: CustomCredentialResolveDeps }, _optional: Record<string, never> = {}) {
  return {
    describe: (input: { workspaceId: string; label: string }) => describeCredentialByLabel(credentials, input),
    resolve: (input: { workspaceId: string; label: string }) => resolveCustomCredentialByLabel(credentials, input),
  };
}

/** Re-admit bundled providers and configured credential metadata on every call.
 * @complexity O(p + c) admitted providers and their credential metadata reads.
 */
export function createTovuReadyLoginProviderList(required: {
  sourceRoot: string; loadContributions: LoadPluginContributions; credentials: CustomCredentialResolveDeps;
}, _optional: Record<string, never> = {}) {
  return createReadyLoginProviderList({
    listAdmitted: async ({ workspaceId }) => {
      const bundledProviders = await loadBundledLoginProviders({ sourceRoot: required.sourceRoot });
      return loadLoginProviders({ workspaceId, bundledProviders, loadContributions: required.loadContributions });
    },
    hasCredentials: ({ workspaceId, provider }) => hasLoginCredentials({ deps: loginCredentialPorts({ credentials: required.credentials }), workspaceId, provider }),
  });
}
