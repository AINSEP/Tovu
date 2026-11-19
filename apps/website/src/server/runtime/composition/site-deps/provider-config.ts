import type { composeProviderConfig } from "./provider-identity.js";
import type { composeSitePluginRuntime } from "./plugin-runtime.js";
import type { SiteStore } from "../open-site-store.js";
import { CustomCredentialVaultRepo } from "#src/features/custom-credentials/vault-repo";
import { SqliteCustomCredentialSetRepo } from "#src/features/custom-credentials/custom-credential-repo.sqlite";
import { withProviderSettingsMigrations } from "../provider-config-source.js";
import { credentialProject } from "./provider-identity.js";

interface ComposeProviderConfigSourceRequired {
  savedProviderConfig: Awaited<ReturnType<typeof composeProviderConfig>>["providerConfigSource"];
  pluginRuntime: ReturnType<typeof composeSitePluginRuntime>["pluginRuntime"];
  projectVault: Awaited<ReturnType<typeof composeProviderConfig>>["projectVault"];
  kernel: SiteStore["content"];
  projectStore: Awaited<ReturnType<typeof composeProviderConfig>>["projectStore"];
}

export function composeProviderConfigSource(required: ComposeProviderConfigSourceRequired, _optional = {}) {
  const { savedProviderConfig, pluginRuntime, projectVault, kernel, projectStore } = required;
  const providerConfigSource = withProviderSettingsMigrations({ source: savedProviderConfig, providers: async ({ pluginId }) =>
    (await pluginRuntime.discoverPlugins()).find(record => record.id === pluginId)?.manifest?.contributes?.providers ?? [] });
  // 2026-08-31 (mail rule-of-two build): resolved once here, ahead of the `RouteDeps` object
  // literal below, because `mailer:` (built from it) is an earlier property than
  // `customCredentialSetRepo:` — see `resolve-mailer.ts`'s own header for the full design. Sealed
  // via the SAME shared sealer/keyring every other credential repo on this root already reuses (no
  // third `EnvOrFileKeyring` instance).
  // Local rows retain their original ownership; only shared owner rows require site grants.
  // The owner store is opened before this reader (owner 2026-10-25).
  const customCredentialSetRepo = compositionCustomCredentials({ projectVault, kernel, projectStore });

  return { providerConfigSource, customCredentialSetRepo };
}

/** Bind site credentials to the optional project inventory without changing local ownership.
 * @complexity O(1) adapter construction; no repository reads. */
function compositionCustomCredentials({ projectVault, kernel, projectStore }: Pick<ComposeProviderConfigSourceRequired, "projectVault" | "kernel" | "projectStore">, _optional = {}) {
  const customProject = credentialProject({ projectVault, repo: vault => new CustomCredentialVaultRepo({ vault }) });
  return new SqliteCustomCredentialSetRepo(kernel, customProject.project && projectStore
    ? { project: { ...customProject.project, inventoryRepo: new CustomCredentialVaultRepo({ vault: projectStore.vault.repo }) } }
    : customProject);
}
