import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "@/lib/admin-http/request";
import { createSourceControlApi } from "@jini-ai/admin/source-control/api/source-control-api";

/**
 * @file The admin's source-control bindings: `@jini-ai/admin`'s source-control API client, bound once
 * to this host's authenticated `request` and its workspace.
 */

/** The admin API calls of the source-control credentials feature, over this host's `request`. */
export const sourceControlApi = createSourceControlApi({ request, workspaceId: WORKSPACE_ID });
