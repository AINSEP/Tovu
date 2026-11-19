import type { composeEventsOrigin } from "./events-origin.js";
import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { SiteStore } from "../open-site-store.js";
import type { composeSiteKeysMembers } from "./site-keys-members.js";
import type { composeProviderConfigSource } from "./provider-config.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { composeProviderConfig } from "./provider-identity.js";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { composeAssistantCredentials } from "./assistant-credentials.js";
import type { composeContentRepos } from "./content-repos.js";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { SqlSecretsVaultRepo } from "@jini-ai/db/secrets-vault";
import { composeAgentPluginConnections } from "../agent-plugin-connections.js";
import { createApiConnectionVault } from "#src/features/api-connections/vault-stores";
import { createHttpClient as createGuardedMediaHttpClient } from "@jini-ai/platform/http/guarded";
import { createNodeGuardedHttpPorts } from "@jini-ai/platform/http/guarded";
import { createSiteOAuthBindings } from "#src/features/project-keys/site-references";
import { createTovuOAuthHttpPorts } from "#src/platform/oauth/endpoint-safety";
import { resolveApiConnectionRuntime } from "../agent-plugin-connections.js";
import { sharedApiConnectionOptions } from "../agent-plugin-connections.js";

interface ComposeOutboundConnectionsRequired {
  devCapabilityScheme: ReturnType<typeof composeEventsOrigin>["devCapabilityScheme"];
  workspaceId: string;
  agentPluginLifecycle: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLifecycle"];
  kernel: SiteStore["content"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  customCredentialSetRepo: ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"];
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  projectStore: Awaited<ReturnType<typeof composeProviderConfig>>["projectStore"];
  projectSiteId: Awaited<ReturnType<typeof composeProviderConfig>>["siteId"];
  resolvedSiteBinding: ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"];
  identity: ReturnType<typeof composeIdentitySettings>["identity"];
  siteReferenceRepo: ReturnType<typeof composeAssistantCredentials>["siteReferenceRepo"];
  settingsRepo: ReturnType<typeof composeIdentitySettings>["settingsRepo"];
  idGen: ReturnType<typeof composeStoreBasics>["idGen"];
  settingsPrincipals: ReturnType<typeof composeIdentitySettings>["settingsPrincipals"];
  formDefinitionRepo: ReturnType<typeof composeContentRepos>["formDefinitionRepo"];
}

export function composeOutboundConnections(required: ComposeOutboundConnectionsRequired, _optional = {}) {
  const { devCapabilityScheme, workspaceId, agentPluginLifecycle, kernel, siteAssistantSecretKeyring, siteAssistantSecretSealer, customCredentialSetRepo, clock, projectStore, projectSiteId, resolvedSiteBinding, identity, siteReferenceRepo, settingsRepo, idGen, settingsPrincipals, formDefinitionRepo } = required;

  // One pinned HTTP capability backs both media and OAuth; each request keeps its own tighter budget.
  const guardedOutboundHttpClient = createGuardedMediaHttpClient({
      ...createNodeGuardedHttpPorts({}),
      userAgent: "Tovu/0.1.0",
      // Preserve Jini's generation budget (10 minutes, 96 MiB); asset requests may choose less.
      // Redirects are refused; provider-returned URLs get no private-network exception.
      policy: { allowedSchemes: ["https", "http"], denyPrivateAddresses: true, devHostAllowlist: [],
        maxRedirects: 0, connectTimeoutMs: 10 * 60 * 1000,
        maxResponseBytes: 96 * 1024 * 1024, maxDecompressedBytes: 96 * 1024 * 1024 },
    });
  // c266749d0: desktop's loopback callback needs the same exception as plugin API OAuth.
  const externalMcpOAuthHttpPorts = createTovuOAuthHttpPorts({ http: guardedOutboundHttpClient }, { allowLoopbackHttp: resolveApiConnectionRuntime({ env: process.env }) === "desktop" });
  const derivedPublicOrigin = resolveCompositionPublicOrigin({ devCapabilityScheme });

  // Plugin API connections, executable plugin-tool ports and admin-surface handlers share one
  // connection port and one sealed vault (kind `api-connection`, migration 0020).
  const agentPluginConnections = composeAgentPluginConnections({
    workspaceId, loadContributions: agentPluginLifecycle.loadPluginContributions,
    vaultRepo: new SqlSecretsVaultRepo({ kernel: kernel as unknown as KyselyKernel<SecretsVaultDatabase> }),
    keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, customCredentialRepo: customCredentialSetRepo, clock, http: guardedOutboundHttpClient,
    env: process.env, derivedPublicOrigin,
  }, {
    shared: sharedApiConnectionOptions({ projectStore, siteId: projectSiteId, siteName: resolvedSiteBinding.name, ownerPrincipalId: identity.ownerPrincipalId,
      bindings: createSiteOAuthBindings({ workspaceId, repo: siteReferenceRepo,
        vault: createApiConnectionVault({ repo: siteReferenceRepo, keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, clock, workspaceId }) }) }),
    // A plugin's destination screen saves its own adapter's form-delivery bindings (an admin action).
    deliveryBindings: { settings: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals }, forms: formDefinitionRepo, newBindingId: () => idGen.newId() },
  });
  return { guardedOutboundHttpClient, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPluginConnections };
}

function resolveCompositionPublicOrigin({ devCapabilityScheme }: Pick<ComposeOutboundConnectionsRequired, "devCapabilityScheme">, _options = {}): string {
  // See `routes/types.ts`'s `derivedPublicOrigin` doc. Reuses `devCapabilityScheme` (derived just
  // above for the dev-capability origin seed) rather than calling `resolveDevTls` a second time —
  // that would re-read the cert/key PEM files off disk for no reason, since the scheme is the only
  // part of that resolution this needs. Hoisted so the plugin connection seams share it.
  return process.env.TOVU_SITE_LISTENER_ORIGIN ?? `${devCapabilityScheme}://localhost:${Number(process.env.PORT ?? 3000)}`;
}
