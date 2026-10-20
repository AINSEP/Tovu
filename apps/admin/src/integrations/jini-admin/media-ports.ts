import { createHttpMediaApi } from '@jini-ai/admin/media/adapters/http';
import type { MediaApiPort, MediaProvidersPort, MediaProvider, MediaEventsPort, MediaProviderConfiguration, MediaProviderConfigurationMap } from '@jini-ai/admin/media';
import type { MediaProviderOption } from '@jini-ai/ui';
import { authenticatedAdminRequest, authenticatedAdminUrl, WORKSPACE_ID, type AdminMediaProviderCredentials, type AdminMediaProviderMap } from '../../lib/api';
import { MEDIA_PROVIDER_CATALOG, PINNED_MEDIA_PROVIDER_IDS } from '../../features/media/media-provider-catalog';
import { contentRefreshApplies, subscribeToContentRefresh } from '../../lib/content-refresh-bus';
import { hasPermission } from "@jini-ai/ui/panel-kit";

const mediaBasePath = `/workspaces/${WORKSPACE_ID}/media`;
export const mediaTransport = { request: authenticatedAdminRequest, url: authenticatedAdminUrl };
// Supplying this route enables Jini's optional replace method AND replaceSupported flag.
// The server reauthorizes media.update and refuses adapters without atomic replacement.
const httpMediaApi = createHttpMediaApi({ transport: mediaTransport, basePath: mediaBasePath }, {
  replacePath: ({ id }) => `${mediaBasePath}/${encodeURIComponent(id)}/replace`,
});
export const mediaApi: MediaApiPort = {
  ...httpMediaApi,
  restoreSupported: true,
  async restore({ id }, { signal } = {}) {
    signal?.throwIfAborted();
    // Trash owns restoration and uses a selection/result protocol, so restorePath's
    // single-asset POST contract cannot be used. A 200 can still mean per-item denial.
    const result = await authenticatedAdminRequest<{ results?: readonly { entityType: string; entityId: string; outcome: string }[] }>({
      path: `/workspaces/${WORKSPACE_ID}/trash/restore`, method: 'POST',
      body: { items: [{ entityType: 'media', entityId: id }] },
    }, { signal });
    const outcome = Array.isArray(result?.results) ? result.results.find(row => row.entityType === 'media' && row.entityId === id)?.outcome : undefined;
    if (outcome !== 'restored') throw new Error(`Media restore failed: ${outcome ?? 'missing item result'}`);
    // Return only the authoritative asset, preserving all CMS metadata and identity.
    const restored = (await httpMediaApi.list({}, { signal })).find(row => row.id === id);
    if (!restored || restored.status !== 'active') throw new Error(`Restored media "${id}" could not be read back as an active asset; reload the library to see its current state`);
    return restored;
  },
};
const capabilities = ['media.read', 'media.upload', 'media.update', 'media.trash', 'media.delete.force'] as const;
/** Flattened session wildcards must expand before Jini's explicit-grant composition check.
 * This only controls affordances; the server reauthorizes every operation. */
export function mediaSessionGrants({ permissions }: { permissions: readonly string[] }, _optional: Record<string, never> = {}) {
  const granted = (permission: string) => hasPermission({ permissions, permission });
  return [...capabilities.filter(granted),
    ...(granted('admin.integrations.manage') ? ['media.providers'] : []),
    // Mirror Trash's entry and per-kind gates; the reread also requires media.read.
    ...(granted('content.read') && granted('media.delete') && granted('media.read') ? ['media.restore'] : [])];
}
export const mediaEvents: MediaEventsPort = {
  subscribe({ onRefresh }) {
    return subscribeToContentRefresh(scope => { if (contentRefreshApplies(scope, 'media')) onRefresh(); });
  },
};

/** Writes accept only this host's catalog; anything else is refused before the PUT. */
function catalogProvider({ id }: { id: string }): MediaProviderOption {
  const provider = MEDIA_PROVIDER_CATALOG.find(entry => entry.id === id);
  if (!provider) throw new Error(`Unknown media provider "${id}": it is not in this host's provider catalog`);
  return provider;
}
/** Never return key material to the view: only markers, endpoint and model leave this port. */
function providerView({ provider, values }: { provider: MediaProviderOption; values: AdminMediaProviderMap }): MediaProvider {
  const saved = values[provider.id] ?? {};
  return { id: provider.id, label: provider.label,
    configured: saved.apiKeyConfigured === true,
    ...(saved.apiKeyTail ? { apiKeyTail: saved.apiKeyTail.slice(-4) } : {}),
    ...(saved.baseUrl === undefined ? {} : { baseUrl: saved.baseUrl }),
    ...(saved.model === undefined ? {} : { model: saved.model }) };
}
function catalogViews({ values }: { values: AdminMediaProviderMap }): MediaProvider[] {
  return MEDIA_PROVIDER_CATALOG.map(provider => providerView({ provider, values }));
}
function withoutProvider({ current, id }: { current: AdminMediaProviderMap; id: string }): AdminMediaProviderMap {
  const next = { ...current };
  // The server keeps blank keys; omission is its only supported clear operation.
  delete next[id];
  return next;
}
function withCredential({ current, id, credential }: { current: AdminMediaProviderMap; id: string; credential: string }): AdminMediaProviderMap {
  return { ...current, [id]: { ...current[id], apiKey: credential } };
}
function withSettings({ current, id, settings }: { current: AdminMediaProviderMap; id: string; settings: { baseUrl: string; model: string } }): AdminMediaProviderMap {
  const entry: AdminMediaProviderCredentials = { ...current[id], ...settings };
  // Blank settings clear their fields. Omit a provider only after its last
  // setting is gone and no saved credential needs the server's keep-key path.
  if (!settings.baseUrl.trim()) delete entry.baseUrl;
  if (!settings.model.trim()) delete entry.model;
  const next = { ...current, [id]: entry };
  if (!entry.baseUrl && !entry.model && !entry.apiKeyConfigured && !entry.apiKey) delete next[id];
  return next;
}
function trimmedEntry({ entry }: { entry: MediaProviderConfiguration }): AdminMediaProviderCredentials {
  const baseUrl = entry.baseUrl?.trim();
  const model = entry.model?.trim();
  const apiKey = entry.apiKey?.trim();
  return {
    ...(baseUrl ? { baseUrl } : {}), ...(model ? { model } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(entry.apiKeyConfigured ? { apiKeyConfigured: true } : {}),
  };
}
function withCatalogEntries({ current, providers }: { current: AdminMediaProviderMap; providers: MediaProviderConfigurationMap }): AdminMediaProviderMap {
  const next = { ...current };
  for (const { id } of MEDIA_PROVIDER_CATALOG) {
    const entry = providers[id];
    const kept = entry ? trimmedEntry({ entry }) : {};
    // Blank keys use the server's keep-key path. Explicit omission (Clear) is
    // the only supported removal; markers are never recoverable key material.
    if (Object.keys(kept).length > 0 || entry?.apiKeyTail) next[id] = kept;
    else delete next[id];
  }
  return next;
}

/** PUT replaces the entire set: reread and serialize each edit, preserving siblings and
 * the edited provider's model/baseUrl. Never return key material to the view. */
export function createMediaProvidersPort(_required: Record<string, never>, _optional: Record<string, never> = {}): MediaProvidersPort {
  let writes: Promise<unknown> = Promise.resolve();
  const path = `${mediaBasePath}/providers`;
  function read({ signal }: { signal?: AbortSignal }) {
    return authenticatedAdminRequest<AdminMediaProviderMap>({ path, method: 'GET' }, { signal });
  }
  function replaceAll<T>({ change, present }: { change: (input: { current: AdminMediaProviderMap }) => AdminMediaProviderMap; present: (input: { values: AdminMediaProviderMap }) => T }, { signal }: { signal?: AbortSignal } = {}): Promise<T> {
    const operation = writes.then(async () => {
      signal?.throwIfAborted();
      const next = change({ current: await read({ signal }) });
      return present({ values: await authenticatedAdminRequest<AdminMediaProviderMap>({ path, method: 'PUT', body: next }, { signal }) });
    });
    writes = operation.catch(() => undefined);
    return operation;
  }
  function writeProvider({ id, change }: { id: string; change: (input: { current: AdminMediaProviderMap }) => AdminMediaProviderMap }, { signal }: { signal?: AbortSignal } = {}) {
    return replaceAll({
      change: ({ current }) => { catalogProvider({ id }); return change({ current }); },
      present: ({ values }) => providerView({ provider: catalogProvider({ id }), values }),
    }, { signal });
  }
  return {
    catalog: MEDIA_PROVIDER_CATALOG,
    pinnedProviderIds: PINNED_MEDIA_PROVIDER_IDS,
    saveChanges({ providers }, { signal } = {}) {
      return replaceAll({
        change: ({ current }) => {
          for (const id of Object.keys(providers)) catalogProvider({ id });
          // One Save changes replaces the catalog's working set. Reread first to retain
          // providers outside this host's catalog; no intermediate per-card PUT can erase them.
          return withCatalogEntries({ current, providers });
        },
        present: catalogViews,
      }, { signal });
    },
    async list(_required, { signal } = {}) {
      try {
        return catalogViews({ values: await read({ signal }) });
      } catch (error) {
        if (signal?.aborted) throw error;
        // An unreachable read is not evidence that the server manages no providers.
        return null;
      }
    },
    saveSettings({ id, baseUrl, model }, { signal } = {}) { return writeProvider({ id, change: ({ current }) => withSettings({ current, id, settings: { baseUrl, model } }) }, { signal }); },
    saveCredential({ id, credential }, { signal } = {}) { return writeProvider({ id, change: ({ current }) => withCredential({ current, id, credential }) }, { signal }); },
    removeCredential({ id }, { signal } = {}) { return writeProvider({ id, change: ({ current }) => withoutProvider({ current, id }) }, { signal }); },
  };
}
