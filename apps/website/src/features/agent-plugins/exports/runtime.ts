import { createPluginExportRuntime as createWithPorts } from '@jini-ai/agent-plugins/site/exports/runtime';
import { embedMarkerSnippetFromConfig, markersOfType } from '@jini-ai/cms/widgets/markers';
import { MEMBER_OIDC_PATH } from '@jini-ai/core/contracts/headless/member-login';
import { PLUGIN_EXPORT_FILES_PREFIX } from './bindings.js';

export function createPluginExportRuntime(
  required: Omit<Parameters<typeof createWithPorts>[0], 'filesPrefix' | 'memberLoginStart' | 'markersOfType' | 'embedMarkerSnippetFromConfig'>,
  _options = {},
) {
  return createWithPorts({ ...required, filesPrefix: PLUGIN_EXPORT_FILES_PREFIX, markersOfType, embedMarkerSnippetFromConfig,
    memberLoginStart: ({ workspaceId, providerId }) => MEMBER_OIDC_PATH.replace(':workspaceId', encodeURIComponent(workspaceId)).replace(':providerId', encodeURIComponent(providerId)) + '/start',
  });
}
