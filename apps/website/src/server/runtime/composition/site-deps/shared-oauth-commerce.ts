import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { composeSiteKeysMembers } from "./site-keys-members.js";
import type { composeAssistantCredentials } from "./assistant-credentials.js";
import type { composeProviderConfig } from "./provider-identity.js";
import type { CreateSiteRouteDepsOverrides } from "./overrides.js";
import type { SiteStore } from "../open-site-store.js";
import type { composeProviderConfigSource } from "./provider-config.js";
import type { providerPluginBoot } from "./provider-identity.js";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { SINGLE_HOP_HTTPS_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import { composeCommerce } from "../commerce.js";
import { createApiConnectionVault } from "#src/features/api-connections/vault-stores";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { createSharedOAuthOwnerStorage } from "#src/features/api-connections/shared-owner";
import { createSiteOAuthBindings } from "#src/features/project-keys/site-references";
import { dirname } from "node:path";

interface CompositionSharedOAuthRequired {
  resolvedSiteBinding: ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"];
  workspaceId: string;
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  identity: ReturnType<typeof composeIdentitySettings>["identity"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  siteReferenceRepo: ReturnType<typeof composeAssistantCredentials>["siteReferenceRepo"];
  projectSiteId: Awaited<ReturnType<typeof composeProviderConfig>>["siteId"];
  projectStore: Awaited<ReturnType<typeof composeProviderConfig>>["projectStore"];
}

/** Bind OAuth to the optional project transaction owner; no service exists without a site id.
 * @complexity O(1) service construction; no network or storage calls. */
export function compositionSharedOAuth(required: CompositionSharedOAuthRequired, _optional = {}) {
  const { resolvedSiteBinding, workspaceId, clock, identity, siteAssistantSecretKeyring, siteAssistantSecretSealer, siteReferenceRepo, projectSiteId, projectStore } = required;
  return projectStore && projectSiteId ? { shared: { ownerWorkspaceId: 'project', owner: createSharedOAuthOwnerStorage({ scope: projectStore.vault, clock }),
      bindings: createSiteOAuthBindings({ workspaceId, repo: siteReferenceRepo,
        vault: createApiConnectionVault({ repo: siteReferenceRepo, keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, clock, workspaceId }) }),
      attachments: projectStore.attachments, transaction: projectStore.transaction, siteId: projectSiteId, siteName: resolvedSiteBinding.name,
      ownerPrincipalId: identity.ownerPrincipalId, inventory: projectStore.inventory ? () => {
        if (!projectStore.inventory) throw new Error("shared OAuth has no project inventory service");
        return projectStore.inventory({});
      } : undefined } } : {};
}

interface CompositionCommerceRequired {
  dbPath: string;
  overrides: Partial<CreateSiteRouteDepsOverrides>;
  resolvedSiteBinding: ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"];
  agentPluginLayout: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLayout"];
  kernel: SiteStore["content"];
  workspaceId: string;
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  idGen: ReturnType<typeof composeStoreBasics>["idGen"];
  settingsRepo: ReturnType<typeof composeIdentitySettings>["settingsRepo"];
  siteSettingsReady: ReturnType<typeof composeIdentitySettings>["siteSettingsReady"];
  projectSiteId: Awaited<ReturnType<typeof composeProviderConfig>>["siteId"];
  providerConfigSource: ReturnType<typeof composeProviderConfigSource>["providerConfigSource"];
  providerPlugins: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>;
  observability: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["observability"];
}

/** Assemble the commerce runtime with this process's existing site and worker ownership.
 * @complexity O(1) composition; the commerce service owns subsequent bounded work. */
export function compositionCommerce(required: CompositionCommerceRequired, _optional = {}) {
  const { dbPath, overrides, resolvedSiteBinding, agentPluginLayout, kernel, workspaceId, clock, idGen, settingsRepo, siteSettingsReady, projectSiteId, providerConfigSource, providerPlugins, observability } = required;
  return composeCommerce({ kernel: kernel as unknown as KyselyKernel<unknown>,
    workspaceId, siteId: projectSiteId || workspaceId, workspaceRoot: agentPluginLayout.forWorkspace({ workspaceId }).root,
    workerOwner: (overrides.storeRole ?? 'owner') === 'owner', workerDirectory: dbPath === ':memory:' ? resolvedSiteBinding.dir : dirname(dbPath),
    settingsRepo, providerConfig: providerConfigSource, providers: providerPlugins,
    // Commerce reads only registered setting definitions (ready with `siteSettingsReady`); gating it on `siteTitleReady` made /products wait on the legacy-title pin.
    settingsReady: siteSettingsReady,
    httpClient: { send: ({ request }, options) => createDefaultHttpClient({ policy: SINGLE_HOP_HTTPS_EGRESS_POLICY }, { observability }).send(request, options) }, clock, idGen,
  });
}
