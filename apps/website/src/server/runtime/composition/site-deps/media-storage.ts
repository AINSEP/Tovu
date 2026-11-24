import { type MediaObjectStorePorts, type ObjectStoreHost, type TovuObjectStoreProvider } from "#src/features/object-storage/media-store";
import { bundledAgentPluginsDir } from "../site-paths.js";
import { composePublishCredentialSource } from "#src/features/deployments/static-publish/credentials";
import { createDeployHostKit } from "#src/features/deployments/deploy-targets/host-kit";
import { createMediaBlobStore } from "#src/features/object-storage/media-store";
import { loadBundledObjectStoreRegistry, loadObjectStoreRegistry, readBundledObjectStoreEnvDeclarations } from "@jini-ai/platform/object-store/site/registry";
import { contributeProviders, defineProviderContribution } from "@jini-ai/agent-plugins/lifecycle";
import type { ObjectStoreDescriptor } from "@jini-ai/platform/object-store";
import { bundledContributionSources } from "#src/features/agent-plugins/bundled-contribution-sources";
import { loadPluginContributionsFromSource } from "#src/features/agent-plugins/lifecycle";
import { mediaUploadsDir } from "../site-paths.js";
import { getEffective } from "@jini-ai/core/settings";
import { readMediaObjectStoreSetting } from "@jini-ai/platform/object-store/site/setting";
import { storeBoundServicesFor } from "../store-bound-services.js";
import { toDeployTargetCredential } from "#src/features/deployments/static-publish/credentials";
import { trackFetch } from "@jini-ai/diagnostics/observability";
import type { CreateSiteRouteDepsOverrides, resolveSiteBindingOverride } from "./overrides.js";
import type { providerPluginBoot } from "./provider-identity.js";
import type { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import type { SqliteSettingsRepo } from "#src/features/settings/repo.sqlite";
import type { SiteStore } from "../open-site-store.js";

interface ComposeMediaStorageRequired {
  overrides: Partial<CreateSiteRouteDepsOverrides>;
  resolvedSiteBinding: ReturnType<typeof resolveSiteBindingOverride>;
  observability: () => Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["observability"];
  workspaceId: () => string;
  agentPluginLifecycle: ReturnType<typeof createTovuAgentPluginLifecycle>;
  settingsRepo: () => SqliteSettingsRepo;
  store: SiteStore;
  dbPath: string;
}

/** The agent-plugins contribution seam the Jini object-store registry loaders take, pinned to Tovu's host. */
const objectStoreContributionPorts = {
  defineProviderContribution: defineProviderContribution<ObjectStoreDescriptor, TovuObjectStoreProvider>,
  contributeProviders: contributeProviders<TovuObjectStoreProvider>,
};

export function composeMediaStorage(required: ComposeMediaStorageRequired, _optional = {}) {
  const { overrides, resolvedSiteBinding, observability, workspaceId, agentPluginLifecycle, settingsRepo, store, dbPath } = required;
  // `observability` comes from provider plugins, initialized below once the site vault is
  // normalized (their key cards are sealed credentials) and before any consumer of the port.
  // Resolved here, before the first fire-and-forget boot promise below: `createMediaBlobStore` throws
  // on an unknown TOVU_MEDIA_BLOB_STORE or an incomplete S3 config, and a throw after those promises
  // start leaves them running against the store `createSiteRouteDeps` then closes — each one rejects
  // unhandled ("The database connection is not open") on top of the operator's real config error.
  // The provider itself (env override > `core.storage.mediaObjectStore` > local) resolves on first
  // media use through the late-bound ports below (`features/object-storage/media-store.ts`).
  const resolvedUploadsDir = overrides.uploadsDir ?? mediaUploadsDir({ siteDir: resolvedSiteBinding.dir });
  // The site's saved connection is read through the same publish credential source shares use
  // (one bucket credential for media and shares); that source needs `routeDeps`, built later.
  let provideMediaCredentials!: (source: ReturnType<typeof composePublishCredentialSource>) => void;
  const mediaCredentials = new Promise<ReturnType<typeof composePublishCredentialSource>>((done) => { provideMediaCredentials = done; });
  const mediaStorePorts = (): MediaObjectStorePorts => ({
    host: { createSigV4Client: createDeployHostKit({}).createSigV4Client, wrapFetch: (fetchFn) => trackFetch({ fetch: fetchFn, observability: observability() }) },
    loadBundledRegistry: () => loadBundledObjectStoreRegistry<ObjectStoreHost, ReturnType<typeof objectStoreContributionPorts.defineProviderContribution>>({ uploadsDir: resolvedUploadsDir, sourceRoot: bundledAgentPluginsDir(), bundledContributionSources, loadPluginContributionsFromSource, ...objectStoreContributionPorts }),
    loadSiteRegistry: () => loadObjectStoreRegistry<ObjectStoreHost, ReturnType<typeof objectStoreContributionPorts.defineProviderContribution>>({ workspaceId: workspaceId(), uploadsDir: resolvedUploadsDir, loadContributions: agentPluginLifecycle.loadPluginContributions, ...objectStoreContributionPorts }),
    readSetting: () => readMediaObjectStoreSetting({ settingsRepo: settingsRepo(), workspaceId: workspaceId(), getEffective }),
    resolveSharedCredential: async ({ providerId }) => {
      // Provider ids use underscores; the saved connection is keyed by the deploy target's hyphenated id.
      const resolved = await (await mediaCredentials).resolve({ workspaceId: workspaceId(), target: providerId.replace(/_/g, "-") });
      if (!resolved.ok) return undefined;
      const { token, ...fields } = toDeployTargetCredential(resolved);
      return { fields, secret: token };
    },
  });
  const { blobStore, mediaIsRemoteByEnv, isMediaRemote } = createMediaBlobStore({ uploadsDir: resolvedUploadsDir, env: process.env, ports: mediaStorePorts }, { envDeclarations: readBundledObjectStoreEnvDeclarations({ sourceRoot: bundledAgentPluginsDir(), bundledContributionSources }) });
  // Everything below is built from `kernel` / `chat` (the chat kernel) except these, which depend on
  // the storage engine (`store-bound-services.ts`: `sqliteOnlyServices` or `pgOnlyServices`).
  const storeBound = storeBoundServicesFor({ store, dbPath });
  return { resolvedUploadsDir, provideMediaCredentials, mediaStorePorts, blobStore, mediaIsRemoteByEnv, isMediaRemote, storeBound };
}
