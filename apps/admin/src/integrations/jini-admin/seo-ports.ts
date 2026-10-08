/** Host bindings for the canonical Jini SEO API; authentication stays with mediaTransport. */
import { createHttpSeoApi, type SeoTransportPort, type SeoSitemapTransportPort } from '@jini-ai/admin/seo/adapters/http';
import type { AdminSeoPort, SeoEventsPort, SeoTranslator, SeoErrorFormatter } from '@jini-ai/admin/seo';
import { hasPermission, interpolate } from '@jini-ai/ui/panel-kit';
import { WORKSPACE_ID, describeApiError } from '../../lib/api';
import { siteUrl } from '../../lib/site-url';
import { contentRefreshApplies, subscribeToContentRefresh } from '../../lib/content-refresh-bus';
import { t as translateSeo } from '../../features/seo/seo-i18n';
import { mediaTransport } from './media-ports';

export interface SeoHostPorts {
  seoApi: AdminSeoPort;
  seoEvents?: SeoEventsPort;
}

export const seoEvents: SeoEventsPort = {
  subscribe({ onRefresh }) {
    return subscribeToContentRefresh(scope => { if (contentRefreshApplies(scope, 'seo')) onRefresh(); });
  },
};

// In production this is same-origin; on admin Vite's own origin siteUrl addresses the public
// site server. The desktop's same-origin /admin proxy must retain relative paths instead.
export const seoSitemapTransport: SeoSitemapTransportPort = {
  get({ path, credentials }, { signal } = {}) {
    return fetch(siteUrl(path), { credentials, signal });
  },
};

/** Bind workspace JSON and public XML transports to the existing API adapter.
 * @returns The core SEO API and its filtered refresh port; transport errors propagate unchanged.
 * @example createSeoHostPorts({ transport: mediaTransport });
 */
export function createSeoHostPorts({ transport }: { transport: SeoTransportPort }, { workspaceId = WORKSPACE_ID, sitemapTransport = seoSitemapTransport }: { workspaceId?: string; sitemapTransport?: SeoSitemapTransportPort } = {}): SeoHostPorts {
  return {
    seoApi: createHttpSeoApi({ transport, basePath: `/workspaces/${workspaceId}` }, { sitemapTransport }),
    seoEvents,
  };
}

/** The live implementation, as a module-level singleton — matches redirectsHostPorts. */
export const seoHostPorts = createSeoHostPorts({ transport: mediaTransport });

/** Bind the existing feature/common dictionaries and placeholder interpolation.
 * @returns A pure translator with the original English fallback for unknown keys/locales.
 * @example createSeoTranslator({ locale: 'es' })('Site defaults');
 */
export function createSeoTranslator({ locale }: { locale: string }, _optional: Record<string, never> = {}): SeoTranslator {
  return (key, vars = {}) => interpolate({ template: translateSeo({ locale, key }), vars });
}

/** Preserve the host ApiError empty-message fallback for entry/picker failures. */
export const describeSeoHostError: SeoErrorFormatter = ({ error, fallback }) => describeApiError(error, fallback);

/** Expand session grants through the host permission owner before Jini's explicit route gate.
 * Server requests retain their own authorization; this controls screen affordances only.
 * @example seoSessionGrants({ permissions: ['*'] });
 */
export function seoSessionGrants({ permissions }: { permissions: readonly string[] }, _optional: Record<string, never> = {}): string[] {
  return hasPermission({ permissions, permission: 'admin.seo.manage' }) ? ['admin.seo.manage'] : [];
}
