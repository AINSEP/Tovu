/** Host bindings for Jini's workspace-scoped widgets API and existing refresh/router owners. */
import { createHttpWidgetsApi, type WidgetsTransportPort } from '@jini-ai/admin/widgets/adapters/http';
import type { AdminWidgetsPort, WidgetsEventsPort, WidgetsNavigationPort, WidgetsTranslate } from '@jini-ai/admin/widgets';
import { interpolate } from '@jini-ai/ui/panel-kit';
import { WORKSPACE_ID } from '../../lib/api';
import { contentRefreshApplies, subscribeToContentRefresh } from '../../lib/content-refresh-bus';
import { navigate } from '../../lib/router';
import { t as translateWidgets } from '../../features/widgets/widgets-i18n';
import { mediaTransport } from './media-ports';

export interface WidgetsHostPorts {
  widgetsApi: AdminWidgetsPort;
  widgetsEvents?: WidgetsEventsPort;
  widgetsNavigation?: WidgetsNavigationPort;
}

// Library and regions use different resource names; editors keep their baseVersion drafts.
export const widgetsEvents: WidgetsEventsPort = {
  subscribe({ resource, onRefresh }) {
    return subscribeToContentRefresh(scope => { if (contentRefreshApplies(scope, resource)) onRefresh(); });
  },
};
export const widgetsNavigation: WidgetsNavigationPort = {
  navigate({ routePath }, options = {}) { navigate(routePath, options); },
};

/** Bind the existing authenticated transport; basePath is the workspace root because Trash
 * is a sibling of widgets. Errors and cancellation propagate through the canonical adapter.
 * @returns API, filtered refresh and navigation ports. Time/space: O(1).
 */
export function createWidgetsHostPorts({ transport }: { transport: WidgetsTransportPort }, { workspaceId = WORKSPACE_ID }: { workspaceId?: string } = {}): WidgetsHostPorts {
  return { widgetsApi: createHttpWidgetsApi({ transport, basePath: `/workspaces/${workspaceId}` }), widgetsEvents, widgetsNavigation };
}
/** The live singleton follows redirectsHostPorts; no duplicate instance/region API owner. */
export const widgetsHostPorts = createWidgetsHostPorts({ transport: mediaTransport });

/** Bind widgets/common copy without absorbing the separate shared-components dictionary.
 * @returns Pure translator with the original fallback and interpolation. O(k) in copy length.
 */
export function createWidgetsTranslator({ locale }: { locale: string }, _optional: Record<string, never> = {}): WidgetsTranslate {
  return (key, vars = {}) => interpolate({ template: translateWidgets({ locale, key }), vars });
}
