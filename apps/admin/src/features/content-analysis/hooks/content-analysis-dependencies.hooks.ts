import { authenticatedAdminRequest } from "@/lib/admin-http/request";
import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { CONTENT_ANALYZER_PLUGIN_ID } from "@jini-ai/admin/screens/content-analysis/rules";
import type { ContentAnalysisPort } from "@jini-ai/admin/screens/content-analysis/hooks/content-analysis-port.hooks";

/**
 * @file The only place `use-content-analysis.hooks.ts` reaches `lib/api` — see
 * `content-analysis-port.hooks.ts` for why the split exists.
 */

const previewPath = ({ pluginId }: { pluginId: string }, _optional = {}) => `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}/preview`;

/** The live implementation, as a module-level singleton. */
export const defaultContentAnalysisPort: ContentAnalysisPort = {
  // Workspace-scoped like every plugins route (`routes/plugins/preview.ts`, PLUGIN_PREVIEW and
  // PLUGIN_PREVIEW_STATUS).
  previewStatus: ({ pluginId }) => authenticatedAdminRequest({ path: previewPath({ pluginId }), method: "GET" }),
  previewPlugin: ({ target: { pluginId }, body }, _optional = {}) => authenticatedAdminRequest({ path: previewPath({ pluginId }), method: "POST", body }),
};
