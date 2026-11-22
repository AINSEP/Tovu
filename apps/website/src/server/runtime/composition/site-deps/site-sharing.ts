import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { composeMediaStorage } from "./media-storage.js";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { composeSiteKeysMembers } from "./site-keys-members.js";
import type { composeMailHttp } from "./mail-http.js";
import type { composeOutboundConnections } from "./outbound-connections.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { composeSiteSavedKeys } from "#src/server/runtime/composition/site-portability";
import { SiteShareRegistry } from "#src/features/site-backup/share-registry";
import { artifactStoreBinding } from "#src/features/object-storage/index";
import { artifactStoreTarget } from "#src/features/object-storage/index";
import { composePublishCredentialSource } from "#src/features/deployments/static-publish/credentials";
import { createDeployHostKit } from "#src/features/deployments/deploy-targets/host-kit";
import { createRuntimeShareDelivery } from "#src/features/site-backup/share-hosting";
import { createSiteCreationTimeZone } from "#src/platform/site-dir/read-site-dir";
import { createSiteShareBackend } from "#src/features/site-backup/share-backend";
import { join } from "node:path";
import { prepareShareContent } from "#src/features/site-backup/share-preparation";
import { readMediaObjectStoreSetting } from "#src/features/object-storage/index";
import { resolvePublishDestinationCredential } from "#src/features/publish-content/destination-credential";
import { resolveShareDelivery } from "#src/features/site-backup/share-hosting";
import { resolveShareDirectory } from "../site-paths.js";
import { resolveSiteTimeZone } from "#src/features/settings/site-timezone";
import { rewriteArchiveMedia } from "#src/server/runtime/composition/site-portability";
import { sanitizeShareDatabase } from "#src/server/runtime/composition/site-portability";
import { selectArtifactStoreProvider } from "#src/features/object-storage/index";
import { selectConnectedDestination } from "#src/features/publish-content/peers";
import { tmpdir } from "node:os";
import { toDeployTargetCredential } from "#src/features/deployments/static-publish/credentials";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";

interface ConfigureSiteSharingRequired {
  dbPath: string;
  resolvedSiteBinding: ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"];
  agentPluginLayout: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLayout"];
  skillLayout: ReturnType<typeof composeAgentPluginBootstrap>["skillLayout"];
  resolvedThemesDir: ReturnType<typeof composeAgentPluginBootstrap>["resolvedThemesDir"];
  resolvedUploadsDir: ReturnType<typeof composeMediaStorage>["resolvedUploadsDir"];
  mediaStorePorts: ReturnType<typeof composeMediaStorage>["mediaStorePorts"];
  blobStore: ReturnType<typeof composeMediaStorage>["blobStore"];
  workspaceId: string;
  identity: ReturnType<typeof composeIdentitySettings>["identity"];
  settingsRepo: ReturnType<typeof composeIdentitySettings>["settingsRepo"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  publishContentPeerHttpClient: ReturnType<typeof composeMailHttp>["publishContentPeerHttpClient"];
  guardedOutboundHttpClient: ReturnType<typeof composeOutboundConnections>["guardedOutboundHttpClient"];
  routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps;
  savedKeys: ReturnType<typeof composeSiteSavedKeys>;
}

interface ShareDeliveryPortsRequired {
  selection: NonNullable<Parameters<typeof resolveShareDelivery>[1]>;
  registry: SiteShareRegistry;
  credentials: ReturnType<typeof composePublishCredentialSource>;
  routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps;
  workspaceId: string;
  guardedOutboundHttpClient: ReturnType<typeof composeOutboundConnections>["guardedOutboundHttpClient"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"];
  publishContentPeerHttpClient: ReturnType<typeof composeMailHttp>["publishContentPeerHttpClient"];
  settingsRepo: ReturnType<typeof composeIdentitySettings>["settingsRepo"];
  mediaStorePorts: ReturnType<typeof composeMediaStorage>["mediaStorePorts"];
}

export function configureSiteSharing(required: ConfigureSiteSharingRequired, _optional = {}): void {
  const { dbPath, resolvedSiteBinding, agentPluginLayout, skillLayout, resolvedThemesDir, resolvedUploadsDir, mediaStorePorts, blobStore, workspaceId, identity, settingsRepo, siteAssistantSecretKeyring, siteAssistantSecretSealer, publishContentPeerHttpClient, guardedOutboundHttpClient, routeDeps, savedKeys } = required;
  const sources = routeDeps.siteBackupSources;
  if (sources) {
    try {
      const contentRoots = [resolvedThemesDir, resolvedUploadsDir, agentPluginLayout.root, skillLayout.root, join(resolvedSiteBinding.dir, "plugins"), join(resolvedSiteBinding.dir, "overrides")];
      const registry = new SiteShareRegistry({ directory: resolveShareDirectory({ siteDir: resolvedSiteBinding.dir, dbPath, contentRoots }) });
      const credentials = composePublishCredentialSource({ workspaceId, executionMode: routeDeps.publishExecutionMode,
        dbDeps: { repo: routeDeps.vendorCredentialSetRepo, sealer: siteAssistantSecretSealer, loadDeployTargets: routeDeps.loadDeployTargets } });
      routeDeps.siteShareBackend = createSiteShareBackend({ registry, site: workspaceId, zip: zipFolderFiles, savedKeys, ownerPrincipalId: identity.ownerPrincipalId,
        prepare: ({ signal, ...selection }) => prepareShareContent({ dbOps: routeDeps.dbOps, snapshotRoot: tmpdir(), sources, sanitize: sanitizeShareDatabase, blobStore, imageTransformer: routeDeps.imageTransformer, rewriteMedia: rewriteArchiveMedia, savedKeys, ...selection }, { signal, packageThemesRoot: routeDeps.packageThemesDir }),
        staticSite: {
          render: input => routeDeps.exportSiteBound({ ...input, includeThemePreviews: false }),
          now: () => new Date(routeDeps.clock.nowMs()),
          themes: () => routeDeps.themes.filter(theme => theme.status === "valid").map(theme => ({ themeId: theme.manifest.id, title: theme.manifest.name })),
          context: async () => {
            const context = await routeDeps.staticSiteContext();
            const creationZone = createSiteCreationTimeZone({ dir: resolvedSiteBinding.dir });
            const timeZone = await resolveSiteTimeZone({ settingsRepo, creationTimeZone: { read: () => creationZone.read() ?? Intl.DateTimeFormat().resolvedOptions().timeZone } }, { workspaceId });
            return { ...context, timeZone };
          },
        },
        delivery: selection => resolveShareDelivery(shareDeliveryPorts({ selection, registry, credentials, routeDeps, workspaceId, guardedOutboundHttpClient, siteAssistantSecretSealer, siteAssistantSecretKeyring, publishContentPeerHttpClient, settingsRepo, mediaStorePorts }), selection),
      });
    } catch (error) {
      console.error("[site-share] Private share storage unavailable; sharing is disabled:", error);
      routeDeps.siteShareBackend = undefined;
    }
  }
}

function shareDeliveryPorts(required: ShareDeliveryPortsRequired, _optional = {}): Parameters<typeof resolveShareDelivery>[0] {
  const { selection, registry, credentials, routeDeps, workspaceId, guardedOutboundHttpClient, siteAssistantSecretSealer, siteAssistantSecretKeyring, publishContentPeerHttpClient, settingsRepo, mediaStorePorts } = required;
  const resolveShareCredential = async ({ id }: { id: string }, _options = {}) => {
    const resolved = await credentials.resolve({ workspaceId, target: artifactStoreTarget({ id }) });
    return resolved.ok ? resolved : undefined;
  };
  const createShareHostKit = (_required: Record<string, never>, _options = {}) => {
    // Reuse the plugin's signing/PUT/DELETE owner; pin only the anonymous verification hop.
    // A normal publish's kit remains unchanged, including its observability.
    const kit = createDeployHostKit({});
    return { ...kit, fetch: async (url: string, init: RequestInit, options: { timeoutMs: number }) => {
      // A provider whose own upload/delete API goes through kit.fetch (not SigV4) keeps it.
      if (init.method !== "HEAD") return kit.fetch(url, init, options);
      const response = await guardedOutboundHttpClient.send({ request: { method: "HEAD", url, headers: {}, idleTimeoutMs: options.timeoutMs, totalDeadlineMs: options.timeoutMs, maxResponseBytes: 1024, signal: init.signal ?? undefined } }, { redirect: "error" });
      return new Response(null, { status: response.status, headers: response.headers });
    } };
  };
  // Token-bearing verification requests use the guarded HTTP owner without telemetry. Never
  // infer a recipient-facing URL from localhost, Host, or ephemeral deployment storage.
  return {
    http: guardedOutboundHttpClient,
    peer: async () => {
      const rows = await routeDeps.publishContentPeerRepo.listByWorkspace({ workspaceId });
      const connected = selectConnectedDestination({ rows });
      if (!connected || selection.binding !== undefined && selection.binding !== connected.baseUrl) return undefined;
      const credential = await resolvePublishDestinationCredential({ deps: { repo: routeDeps.publishContentPeerRepo,
        sealer: siteAssistantSecretSealer, keyring: siteAssistantSecretKeyring, httpClient: publishContentPeerHttpClient },
      input: { workspaceId, id: connected.id } });
      return { credential, httpClient: publishContentPeerHttpClient };
    },
    ...(process.env.TOVU_SHARE_PUBLIC_ORIGIN && process.env.TOVU_SHARE_PERSISTENT_STORAGE === "1" ? {
      runtime: () => {
        const publicOrigin = process.env.TOVU_SHARE_PUBLIC_ORIGIN;
        if (!publicOrigin) throw new Error("site share delivery has no public origin");
        return createRuntimeShareDelivery({ registry, site: workspaceId, publicOrigin, http: guardedOutboundHttpClient });
      },
    } : {}),
    objectStore: async () => {
      // Any object-store provider that can deliver artifacts (not one hard-coded deploy target);
      // the site's media choice wins so media and shares share one provider and connection.
      // Revoke passes the share's saved provider, so only that store may delete it.
      const chosen = await selectArtifactStoreProvider({ loaded: await mediaStorePorts().loadSiteRegistry(), preferredId: await readMediaObjectStoreSetting({ settingsRepo, workspaceId }),
        resolveCredential: resolveShareCredential },
      selection.provider === undefined ? {} : { savedProvider: selection.provider });
      if (!chosen) return undefined;
      const target = artifactStoreTarget({ id: chosen.id }), resolved = chosen.credential;
      const store = chosen.provider.createArtifactStore({ credential: toDeployTargetCredential(resolved), config: {}, kit: createShareHostKit({}) });
      return { provider: target, binding: artifactStoreBinding({ store, credential: resolved }), store };
    },
  };
}
