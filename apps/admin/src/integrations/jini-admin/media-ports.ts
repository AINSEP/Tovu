import { createHttpMediaApi } from '@jini-ai/admin/media/adapters/http';
import type { MediaApiPort, MediaProvidersPort, MediaProvider, MediaEventsPort } from '@jini-ai/admin/media';
import { authenticatedAdminRequest, authenticatedAdminUrl, WORKSPACE_ID, type AdminMediaProviderMap } from '../../lib/api';
import { MEDIA_PROVIDER_CATALOG, PINNED_MEDIA_PROVIDER_IDS } from '../../features/media/media-provider-catalog';
import { contentRefreshApplies, subscribeToContentRefresh } from '../../lib/content-refresh-bus';
import { hasPermission } from '../../lib/permissions';

export const mediaBasePath = `/workspaces/${WORKSPACE_ID}/media`;
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
    if (!restored || restored.status !== 'active') throw new Error('Restored media could not be read');
    return restored;
  },
};
const capabilities = ['media.read', 'media.upload', 'media.update', 'media.trash', 'media.delete.force'] as const;
/** Flattened session wildcards must expand before Jini's explicit-grant composition check.
 * This only controls affordances; the server reauthorizes every operation. */
export function mediaSessionGrants({ permissions }: { permissions: readonly string[] }, _optional: Record<string, never> = {}) {
  return [...capabilities.filter(permission => hasPermission(permissions, permission)),
    ...(hasPermission(permissions, 'admin.integrations.manage') ? ['media.providers'] : []),
    // Mirror Trash's entry and per-kind gates; the reread also requires media.read.
    ...(hasPermission(permissions, 'content.read') && hasPermission(permissions, 'media.delete') && hasPermission(permissions, 'media.read') ? ['media.restore'] : [])];
}
export const mediaEvents: MediaEventsPort = {
  subscribe({ onRefresh }) {
    return subscribeToContentRefresh(scope => { if (contentRefreshApplies(scope, 'media')) onRefresh(); });
  },
};
/** PUT replaces the entire set: reread and serialize each edit, preserving siblings and
 * the edited provider's model/baseUrl. Never return key material to the view. */
export function createMediaProvidersPort(_required: Record<string, never>, _optional: Record<string, never> = {}): MediaProvidersPort {
  let writes: Promise<unknown> = Promise.resolve();
  const path = `${mediaBasePath}/providers`;
  function view({ id, values }: { id: string; values: AdminMediaProviderMap }, _optional: Record<string, never> = {}): MediaProvider {
    return { id, label: MEDIA_PROVIDER_CATALOG.find(provider => provider.id === id)?.label ?? id,
      configured: values[id]?.apiKeyConfigured === true,
      ...(values[id]?.apiKeyTail ? { apiKeyTail: values[id]!.apiKeyTail!.slice(-4) } : {}),
      ...(values[id]?.baseUrl === undefined ? {} : { baseUrl: values[id]!.baseUrl }),
      ...(values[id]?.model === undefined ? {} : { model: values[id]!.model }) };
  }
  function write({ id, credential, settings }: { id: string; credential?: string | null; settings?: { baseUrl: string; model: string } }, { signal }: { signal?: AbortSignal } = {}) {
    const operation = writes.then(async () => {
      signal?.throwIfAborted();
      const current = await authenticatedAdminRequest<AdminMediaProviderMap>({ path, method: 'GET' }, { signal });
      if (!MEDIA_PROVIDER_CATALOG.some(provider => provider.id === id)) throw new Error('Unknown media provider');
      const next = { ...current };
      if (credential === null) {
        // The server keeps blank keys; omission is its only supported clear operation.
        delete next[id];
      } else {
        next[id] = { ...current[id], ...settings, ...(credential === undefined ? {} : { apiKey: credential }) };
        // Blank settings clear their fields. Omit a provider only after its last
        // setting is gone and no saved credential needs the server's keep-key path.
        if (settings) {
          if (!settings.baseUrl.trim()) delete next[id]!.baseUrl;
          if (!settings.model.trim()) delete next[id]!.model;
          if (!next[id]!.baseUrl && !next[id]!.model && !next[id]!.apiKeyConfigured && !next[id]!.apiKey) delete next[id];
        }
      }
      const saved = await authenticatedAdminRequest<AdminMediaProviderMap>({ path, method: 'PUT', body: next }, { signal });
      return view({ id, values: saved });
    });
    writes = operation.catch(() => undefined);
    return operation;
  }
  return {
    catalog: MEDIA_PROVIDER_CATALOG,
    pinnedProviderIds: PINNED_MEDIA_PROVIDER_IDS,
    saveChanges({ providers }, { signal } = {}) {
      const operation = writes.then(async () => {
        signal?.throwIfAborted();
        const current = await authenticatedAdminRequest<AdminMediaProviderMap>({ path, method: 'GET' }, { signal });
        const knownIds = new Set(MEDIA_PROVIDER_CATALOG.map(provider => provider.id));
        if (Object.keys(providers).some(id => !knownIds.has(id))) throw new Error('Unknown media provider');
        // One Save changes replaces the catalog's working set. Reread first to retain
        // providers outside this host's catalog; no intermediate per-card PUT can erase them.
        const next = { ...current };
        for (const id of knownIds) {
          const entry = providers[id];
          if (!entry) { delete next[id]; continue; }
          const baseUrl = entry.baseUrl?.trim();
          const model = entry.model?.trim();
          const apiKey = entry.apiKey?.trim();
          // Blank keys use the server's keep-key path. Explicit omission (Clear) is
          // the only supported removal; markers are never recoverable key material.
          if (!baseUrl && !model && !apiKey && !entry.apiKeyConfigured && !entry.apiKeyTail) {
            delete next[id]; continue;
          }
          next[id] = {
            ...(baseUrl ? { baseUrl } : {}), ...(model ? { model } : {}),
            ...(apiKey ? { apiKey } : {}),
            ...(entry.apiKeyConfigured ? { apiKeyConfigured: true } : {}),
          };
        }
        const saved = await authenticatedAdminRequest<AdminMediaProviderMap>({ path, method: 'PUT', body: next }, { signal });
        return MEDIA_PROVIDER_CATALOG.map(provider => view({ id: provider.id, values: saved }));
      });
      writes = operation.catch(() => undefined);
      return operation;
    },
    async list(_required, { signal } = {}) {
      try {
        const values = await authenticatedAdminRequest<AdminMediaProviderMap>({ path, method: 'GET' }, { signal });
        return MEDIA_PROVIDER_CATALOG.map(provider => view({ id: provider.id, values }));
      } catch (error) {
        if (signal?.aborted) throw error;
        // An unreachable read is not evidence that the server manages no providers.
        return null;
      }
    },
    saveSettings({ id, baseUrl, model }, { signal } = {}) { return write({ id, settings: { baseUrl, model } }, { signal }); },
    saveCredential({ id, credential }, { signal } = {}) { return write({ id, credential }, { signal }); },
    removeCredential({ id }, { signal } = {}) { return write({ id, credential: null }, { signal }); },
  };
}
