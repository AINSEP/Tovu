import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { SiteStore } from "../open-site-store.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { composeSiteKeysMembers } from "./site-keys-members.js";
import type { composeProviderConfig } from "./provider-identity.js";
import type { composeProviderConfigSource } from "./provider-config.js";
import type { providerPluginBoot } from "./provider-identity.js";
import type { composeMailHttp } from "./mail-http.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import { InMemoryPublishCredentialVerificationCache } from "#src/features/deployments/static-publish/index";
import { SINGLE_HOP_HTTPS_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import type { SourceControlCredentialSetRecord } from "#src/features/source-control/types";
import { SqlitePublishHistoryStore } from "#src/platform/db/sqlite/publish-history-repo.sqlite";
import { SqliteSourceControlCredentialSetRepo } from "#src/features/source-control/source-control-credential-repo.sqlite";
import { SqliteVendorCredentialSetRepo } from "#src/features/vendor-credentials/vendor-credential-repo.sqlite";
import { TovuCredentialSetVaultAdapter } from "#src/features/vendor-credentials/vault-adapter";
import { VendorCredentialSetVaultRepo } from "#src/features/vendor-credentials/vault-adapter";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { executionModeFromEnv } from "#src/features/deployments/publish-credentials/index";
import { listPublishedPosts } from "#src/features/post/index";
import { loadCredentialSchemeRegistry } from "#src/features/agent-plugins/auth-schemes";
import { loadDeployOpsRegistry } from "#src/features/deployments/deploy-ops/registry";
import { loadDeployTargetRegistry } from "#src/features/deployments/deploy-targets/registry";
import { loadDeployWorkflowFiles } from "#src/features/deployments/index";
import { loadInstalledDeployTargets } from "#src/features/deployments/deploy-targets/registry";
import { loadMailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import { loadMailCredentialCards } from "../../boot/mail-provider-catalog.js";
import { loadSourceControlProviderRegistry } from "#src/features/source-control/provider-registry";
import { resolvePublishOutputRootDir } from "../site-paths.js";
import { resolveSourceControlExportRootDir } from "../site-paths.js";
import { sourceControlKeyBinding } from "../source-control-key-binding.js";
import { credentialProject } from "./provider-identity.js";

interface RouteDepsPublishCredentialsRequired {
  resolvedSiteBinding: ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"];
  agentPluginLayout: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLayout"];
  agentPluginLifecycle: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLifecycle"];
  kernel: SiteStore["content"];
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  idGen: ReturnType<typeof composeStoreBasics>["idGen"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  projectVault: Awaited<ReturnType<typeof composeProviderConfig>>["projectVault"];
  customCredentialSetRepo: ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"];
  observability: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["observability"];
  customCredentialsHttpClient: ReturnType<typeof composeMailHttp>["customCredentialsHttpClient"];
  siteBackupHttpClient: ReturnType<typeof composeMailHttp>["siteBackupHttpClient"];
  mediaImportHttpClient: ReturnType<typeof composeMailHttp>["mediaImportHttpClient"];
  routeDeps: () => (NewsletterRouteDeps & ByokToolSurfaceDeps);
}

export function routeDepsPublishCredentials(required: RouteDepsPublishCredentialsRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "listPublishedPosts" | "publishHistoryStore" | "publishExecutionMode" | "publishOutputRootDir" | "loadDeployTargets" | "loadInstalledDeployTargets" | "loadDeployWorkflowFiles" | "loadDeployOps" | "loadSourceControlProviders" | "loadPluginCredentialCards" | "loadAuthSchemes" | "publishCredentialVerificationCache" | "sourceControlCredentialSetRepo" | "sourceControlExportRootDir" | "vendorCredentialSetRepo" | "customCredentialSetRepo" | "customCredentialsHttpClient" | "siteBackupHttpClient" | "deployOpsHttpClient" | "mediaImportHttpClient"> {
  const { resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, kernel, clock, idGen, siteAssistantSecretKeyring, siteAssistantSecretSealer, projectVault, customCredentialSetRepo, observability, customCredentialsHttpClient, siteBackupHttpClient, mediaImportHttpClient, routeDeps } = required;
  return {
    listPublishedPosts: () =>
      listPublishedPosts({ deps: { repo: routeDeps().postRepo }, input: { workspaceId: routeDeps().workspaceId } }),
    // 2026-08-16 rework — see `routes/types.ts`'s `publishHistoryStore` doc. Real, DB-backed;
    // `apps/website/src/server/runtime/composition/app.ts`'s hermetic composition uses `InMemoryPublishHistoryStore` instead.
    publishHistoryStore: new SqlitePublishHistoryStore({ store: kernel }),
    // 2026-08-15 (Contract v2) — see `routes/types.ts`'s `publishExecutionMode` doc.
    publishExecutionMode: executionModeFromEnv(),
    // Read ONCE here rather than deep in `static-publish/adapter.ts` — see
    // `resolvePublishOutputRootDir`'s own doc above and `routes/types.ts`'s `publishOutputRootDir`
    // doc.
    publishOutputRootDir: resolvePublishOutputRootDir({ siteDir: resolvedSiteBinding.dir }),
    // See `routes/types.ts`'s `loadDeployTargets` doc: the installed, activated deploy Agent Plugin.
    loadDeployTargets: ({ workspaceId }) => loadDeployTargetRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }),
    loadInstalledDeployTargets: ({ workspaceId }) => loadInstalledDeployTargets({ workspaceId,
      loadContributions: agentPluginLifecycle.loadPluginContributions,
      readEnabled: async ({ workspaceId, pluginId }) => {
        const activation = await agentPluginLifecycle.resolveAgentPluginActivation({ workspaceRoot: agentPluginLayout.forWorkspace({ workspaceId }).root, pluginId });
        return activation.verdict === "undetermined" ? null : activation.verdict === "active";
      },
    }),
    loadDeployWorkflowFiles: input => loadDeployWorkflowFiles({ ...input, loadContributions: agentPluginLifecycle.loadPluginContributions }),
    loadDeployOps: (ctx) => loadDeployOpsRegistry(ctx, { loadContributions: agentPluginLifecycle.loadPluginContributions }),
    loadSourceControlProviders: ({ workspaceId }) => loadSourceControlProviderRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }),
    loadPluginCredentialCards: (workspaceId) => loadMailCredentialCards({ loadMailAdapters: () => loadMailAdapterRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }) }),
    loadAuthSchemes: async (ctx) => (await loadCredentialSchemeRegistry(ctx, { loadContributions: agentPluginLifecycle.loadPluginContributions })).rules,
    // 2026-08-16 — see `routes/types.ts`'s `publishCredentialVerificationCache` doc. Deliberately
    // in-memory, not DB-backed — one instance per process (this function runs once per boot, per
    // `index.ts`/`agent-daemon-server.ts`'s own call sites), same singleton lifetime
    // `siteAssistantSecretSealer` above already has.
    publishCredentialVerificationCache: new InMemoryPublishCredentialVerificationCache(),
    // 2026-08-15 — see `routes/types.ts`'s `sourceControlCredentialSetRepo` doc. Sealed via the
    // same shared sealer/keyring the credential repos above already reuse (no third
    // `EnvOrFileKeyring` instance).
    // Its rows: this site's own, then the project's (owner 2026-10-25).
    sourceControlCredentialSetRepo: new SqliteSourceControlCredentialSetRepo(kernel, {
      ...credentialProject({ projectVault, repo: vault => new TovuCredentialSetVaultAdapter<SourceControlCredentialSetRecord>({ vault, kind: "source-control" }) }),
      canonical: sourceControlKeyBinding({ credentials: { repo: customCredentialSetRepo, keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, clock, idGen },
        loadProviders: ({ workspaceId }) => loadSourceControlProviderRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }) }),
    }),
    // Read ONCE here rather than deep in `source-control/commit-site.ts` — see
    // `resolveSourceControlExportRootDir`'s own doc above and `routes/types.ts`'s
    // `sourceControlExportRootDir` doc.
    sourceControlExportRootDir: resolveSourceControlExportRootDir({ siteDir: resolvedSiteBinding.dir }),
    // 2026-08-16 (Phase 3) — see `routes/types.ts`'s `vendorCredentialSetRepo` doc. Sealed via the
    // same shared sealer/keyring the two legacy credential repos above already reuse (no third
    // `EnvOrFileKeyring` instance). Its rows: this site's own, then the project's (owner 2026-10-25).
    vendorCredentialSetRepo: new SqliteVendorCredentialSetRepo(kernel, credentialProject({ projectVault, repo: vault => new VendorCredentialSetVaultRepo({ vault, kind: "vendor", vendor: true }) })),
    // 2026-08-17 — see `routes/types.ts`'s `customCredentialSetRepo` doc. Sealed via the same
    // shared sealer/keyring the credential repos above already reuse (no third `EnvOrFileKeyring`
    // instance). Same instance `resolvedMailer` above was built from — not a second repo.
    customCredentialSetRepo,
    // See `routes/types.ts`'s own doc — a genuinely separate `HttpClientPort` instance from
    // `resolvedMailer`'s, built above.
    customCredentialsHttpClient,
    siteBackupHttpClient,
    deployOpsHttpClient: createDefaultHttpClient({ policy: SINGLE_HOP_HTTPS_EGRESS_POLICY }, { observability }),
    // 2026-09-06 — see `routes/types.ts`'s `mediaImportHttpClient` doc. A third instance, built
    // above from `MEDIA_IMPORT_EGRESS_POLICY` rather than `SINGLE_HOP_HTTPS_EGRESS_POLICY`.
    mediaImportHttpClient,
  };
}
