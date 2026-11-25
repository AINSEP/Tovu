import { ApiError, authenticatedAdminRequest } from "@/lib/admin-http/request";
import { AdminApiError } from "@jini-ai/core/admin-runtime";
import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { CONTENT_ANALYZER_PLUGIN_ID } from "@jini-ai/admin/screens/content-analysis/rules";
import type { ContentAnalysisPort } from "@jini-ai/admin/screens/content-analysis/hooks/content-analysis-port.hooks";

/**
 * @file The only place `use-content-analysis.hooks.ts` reaches `lib/api` — see
 * `content-analysis-port.hooks.ts` for why the split exists.
 */

const previewPath = ({ pluginId }: { pluginId: string }, _optional = {}) => `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}/preview`;

/** Jini's card recognizes only its own typed error (`PLUGIN_NOT_FOUND` hides the card, the preview
 *  codes get their own copy), so the host's `ApiError` identity is translated at this seam; status,
 *  code and raw body are kept. Anything else is rethrown unchanged. */
function toAdminApiError(error: unknown): never {
  if (error instanceof ApiError) throw new AdminApiError({ message: error.message, status: error.status }, { code: error.code, body: error.body });
  throw error;
}

/** The live implementation, as a module-level singleton. */
export const defaultContentAnalysisPort: ContentAnalysisPort = {
  // Workspace-scoped like every plugins route (`routes/plugins/preview.ts`, PLUGIN_PREVIEW and
  // PLUGIN_PREVIEW_STATUS).
  previewStatus: ({ pluginId }) => authenticatedAdminRequest<{ pluginId: string; enabled: boolean }>({ path: previewPath({ pluginId }), method: "GET" }).catch(toAdminApiError),
  previewPlugin: ({ target: { pluginId }, body }, _optional = {}) => authenticatedAdminRequest<Awaited<ReturnType<ContentAnalysisPort["previewPlugin"]>>>({ path: previewPath({ pluginId }), method: "POST", body }).catch(toAdminApiError),
};
