/** Host bindings for the Jini redirects owner; authentication stays with mediaTransport. */
import { createHttpRedirectsApi, type RedirectsTransportPort } from '@jini-ai/admin/redirects/adapters/http';
import { REDIRECTS_RESOURCE, type AdminRedirectsPort, type RedirectsEventsPort, type RedirectsTranslate } from '@jini-ai/admin/redirects';
import { AdminApiError } from '@jini-ai/admin/core';
import { hasPermission, interpolate } from '@jini-ai/ui/panel-kit';
import { ApiError, WORKSPACE_ID } from '../../lib/api';
import { contentRefreshApplies, subscribeToContentRefresh } from '../../lib/content-refresh-bus';
import { serverLabel } from '../../components/status-labels';
import { actionsForRedirectLabel, createdLabel, failedItemLabel, importResultSummary, t as translateRedirects } from '../../features/redirects/redirects-i18n';
import { mediaTransport } from './media-ports';

export interface RedirectsHostPorts {
  redirectsApi: AdminRedirectsPort;
  redirectsEvents?: RedirectsEventsPort;
}

export const redirectsEvents: RedirectsEventsPort = {
  subscribe(listener) {
    return subscribeToContentRefresh(scope => { if (contentRefreshApplies(scope, REDIRECTS_RESOURCE)) listener(); });
  },
};

/** Bind workspace requests to the existing adapter and translate only the host error identity.
 * @returns API and filtered refresh ports; API failures retain status/code/raw body.
 * @example createRedirectsHostPorts({ transport: mediaTransport });
 */
export function createRedirectsHostPorts({ transport }: { transport: RedirectsTransportPort }, { workspaceId = WORKSPACE_ID }: { workspaceId?: string } = {}): RedirectsHostPorts {
  const hostTransport: RedirectsTransportPort = {
    url: transport.url,
    async request<T>(required: Parameters<RedirectsTransportPort['request']>[0], optional: Record<string, never> = {}): Promise<T> {
      try {
        return await transport.request<T>(required, optional);
      } catch (error) {
        // Jini's formatter recognizes its own typed error. An empty host message must still
        // use the original screen fallback; raw bodies may carry route-specific detail.
        if (error instanceof ApiError) throw new AdminApiError({ message: error.message, status: error.status }, { code: error.code, body: error.body });
        throw error;
      }
    },
  };
  return {
    redirectsApi: createHttpRedirectsApi({ transport: hostTransport, basePath: `/workspaces/${workspaceId}/redirects` }),
    redirectsEvents,
  };
}
export const redirectsHostPorts = createRedirectsHostPorts({ transport: mediaTransport });

/** Bind the existing dictionary, parameterized helper tables and shared protocol labels.
 * @returns A pure translator; unknown keys and server values retain their current fallback.
 * @example createRedirectsTranslator({ locale: 'es' })('Bulk import');
 */
export function createRedirectsTranslator({ locale }: { locale: string }, _optional: Record<string, never> = {}): RedirectsTranslate {
  return (key, vars = {}) => {
    if (vars.serverLabel !== undefined) return serverLabel(String(vars.serverLabel), locale);
    switch (key) {
      case '{created} created, {failed} failed.': return importResultSummary(locale, Number(vars.created), Number(vars.failed));
      case 'Created': return createdLabel(locale);
      case 'Item {index} ({code})': return failedItemLabel(locale, Number(vars.index), String(vars.code));
      case 'Actions for redirect rule from "{fromPattern}"': return actionsForRedirectLabel(locale, String(vars.fromPattern));
      default: return interpolate({ template: translateRedirects({ locale, key }), vars });
    }
  };
}

/** Expand session wildcards through the permission owner before the package's explicit gate.
 * UI grants affect affordances; every server request retains its own authorization.
 * @example redirectsSessionGrants({ permissions: ['*'] });
 */
export function redirectsSessionGrants({ permissions }: { permissions: readonly string[] }, _optional: Record<string, never> = {}): string[] {
  return hasPermission({ permissions, permission: 'admin.redirects.manage' }) ? ['admin.redirects.manage'] : [];
}
