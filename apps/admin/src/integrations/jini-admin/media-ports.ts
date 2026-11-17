import { createHttpMediaApi, createHttpMediaProvidersPort } from '@jini-ai/admin/media/adapters/http';
import type { MediaApiPort, MediaProvidersPort, MediaEventsPort } from '@jini-ai/admin/media';
import { authenticatedAdminRequest } from '../../lib/admin-http/request';
import { authenticatedAdminUrl } from '../../lib/admin-http/urls';
import { WORKSPACE_ID } from '../../lib/admin-http/config';
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
/** A successful batch HTTP response still needs this asset's authoritative per-item outcome. */
function mediaRestoreOutcome({ result, id }: { result: { results?: readonly { entityType: string; entityId: string; outcome: string }[] }; id: string }): string | undefined {
  return Array.isArray(result?.results) ? result.results.find(row => row.entityType === 'media' && row.entityId === id)?.outcome : undefined;
}

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
    const outcome = mediaRestoreOutcome({ result, id });
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
    return subscribeToContentRefresh(scope => { if (contentRefreshApplies({ scope, resource: 'media' })) onRefresh(); });
  },
};

/** The workspace's media provider settings, in Tovu's catalog order; the store logic is Jini's. */
export function createMediaProvidersPort(_required: Record<string, never>, _optional: Record<string, never> = {}): MediaProvidersPort {
  return createHttpMediaProvidersPort(
    { transport: { request: authenticatedAdminRequest }, path: `${mediaBasePath}/providers`, catalog: MEDIA_PROVIDER_CATALOG },
    { pinnedProviderIds: PINNED_MEDIA_PROVIDER_IDS },
  );
}
