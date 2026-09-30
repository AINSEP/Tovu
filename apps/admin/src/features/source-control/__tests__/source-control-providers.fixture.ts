import type { AdminSourceControlProviderDescriptor, AdminSourceControlProvidersSnapshot } from "@/lib/api";

/**
 * @file Source-control hosts as `GET .../system/source-control/providers` lists them, for tests: GitHub
 * as its plugin declares it, and a test host whose form also asks for a required username.
 */
export const GITHUB_PROVIDER: AdminSourceControlProviderDescriptor = {
  id: "github",
  label: "GitHub",
  credential: {
    tokenPageUrl: "https://github.com/settings/personal-access-tokens/new",
    help: "Needs a fine-grained personal access token scoped to just this repository.",
    tokenField: "token",
    fields: [{ name: "token", label: "Access token", required: true, secret: true }],
  },
};

export const FORGE_PROVIDER: AdminSourceControlProviderDescriptor = {
  id: "forge",
  label: "Forge",
  credential: {
    tokenField: "token",
    fields: [
      { name: "token", label: "API token", required: true, secret: true },
      { name: "username", label: "Username", required: true, userHelp: "The Forge username this token belongs to." },
    ],
  },
};

export const SOURCE_CONTROL_PROVIDER_DESCRIPTORS: readonly AdminSourceControlProviderDescriptor[] = [GITHUB_PROVIDER, FORGE_PROVIDER];

export const SOURCE_CONTROL_PROVIDERS_SNAPSHOT: AdminSourceControlProvidersSnapshot = {
  providers: [...SOURCE_CONTROL_PROVIDER_DESCRIPTORS],
  switchedOff: [],
};
