/** Workspace/auth/localization bindings for the existing Jini Forms owner. */
import { createHttpFormsApi, createHttpFormsTrash, type FormsTransportPort } from '@jini-ai/admin/forms/adapters/http';
import { FORMS_LIST_RESOURCE, type AdminFormsPort, type FormsTrashPort, type FormsEventsPort, type FormsNavigationPort, type FormsTranslator } from '@jini-ai/admin/forms';
import { hasPermission, interpolate } from '@jini-ai/ui/panel-kit';
import { t as translateForms } from '../../features/forms/forms-i18n';
import { WORKSPACE_ID } from '../../lib/api';
import { navigate } from '../../lib/router';
import { contentRefreshApplies, subscribeToContentRefresh } from '../../lib/content-refresh-bus';
import { mediaTransport } from './media-ports';

export interface FormsHostPorts {
  formsApi: AdminFormsPort;
  formsTrash: FormsTrashPort;
  formsEvents?: FormsEventsPort;
  formsNavigation?: FormsNavigationPort;
}
export const formsEvents: FormsEventsPort = {
  subscribe({ onRefresh }, _optional: Record<string, never> = {}) {
    return subscribeToContentRefresh(scope => { if (contentRefreshApplies(scope, FORMS_LIST_RESOURCE)) onRefresh(); });
  },
};
/** Delegate request construction to Jini; the host transport owns authentication and errors. */
export function createFormsHostPorts({ transport }: { transport: FormsTransportPort }, { workspaceId = WORKSPACE_ID }: { workspaceId?: string } = {}): FormsHostPorts {
  return {
    formsApi: createHttpFormsApi({ transport, basePath: `/workspaces/${workspaceId}/forms` }),
    formsTrash: createHttpFormsTrash({ transport, basePath: `/workspaces/${workspaceId}/trash/items` }),
    formsEvents,
    formsNavigation: { navigate({ routePath }, options = {}) { navigate(routePath, options); } },
  };
}
export const formsHostPorts = createFormsHostPorts({ transport: mediaTransport });
/** Bind the unchanged Forms dictionary, including shared copy, to the current admin locale. */
export function createFormsTranslator({ locale }: { locale: string }, _optional: Record<string, never> = {}): FormsTranslator {
  return (key, vars) => {
    const template = translateForms({ locale, key });
    return vars ? interpolate({ template, vars }) : template;
  };
}
/** Expand session wildcards through the existing permission owner before explicit module gates. */
export function formsSessionGrants({ permissions }: { permissions: readonly string[] }, _optional: Record<string, never> = {}): string[] {
  return hasPermission({ permissions, permission: 'admin.forms.manage' }) ? ['admin.forms.manage'] : [];
}
