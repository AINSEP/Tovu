/** Host binding for the Jini Content analysis card: the live preview port, built with the host's
 *  authenticated request client. The card itself lives in `@jini-ai/admin/screens/content-analysis`. */
import type { ContentAnalysisPort } from '@jini-ai/admin/screens/content-analysis/hooks/content-analysis-port.hooks';
import { AdminApiError } from '@jini-ai/core/admin-runtime';
import { ApiError, authenticatedAdminRequest } from '../../lib/admin-http/request';
import { WORKSPACE_ID } from '../../lib/admin-http/config';

const previewPath = ({ pluginId }: { pluginId: string }, _optional = {}) => `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}/preview`;

/** Jini's card recognizes only its own typed error (`PLUGIN_NOT_FOUND` hides the card, the preview
 *  codes get their own copy), so the host's `ApiError` identity is translated at this seam; status,
 *  code and raw body are kept. Anything else is rethrown unchanged. */
function toAdminApiError(error: unknown): never {
  if (error instanceof ApiError) throw new AdminApiError({ message: error.message, status: error.status }, { code: error.code, body: error.body });
  throw error;
}

/** The live implementation, as a module-level singleton — `PostSavedPanels` passes it as `port`. */
export const contentAnalysisPort: ContentAnalysisPort = {
  // Workspace-scoped like every plugins route (`routes/plugins/preview.ts`, PLUGIN_PREVIEW and
  // PLUGIN_PREVIEW_STATUS).
  previewStatus: ({ pluginId }) => authenticatedAdminRequest<{ pluginId: string; enabled: boolean }>({ path: previewPath({ pluginId }), method: 'GET' }).catch(toAdminApiError),
  previewPlugin: ({ target: { pluginId }, body }, _optional = {}) => authenticatedAdminRequest<Awaited<ReturnType<ContentAnalysisPort['previewPlugin']>>>({ path: previewPath({ pluginId }), method: 'POST', body }).catch(toAdminApiError),
};
