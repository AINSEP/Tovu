import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "@/lib/admin-http/request";
import { createAnalyticsApi } from "@jini-ai/admin/screens/analytics/api/analytics-api";

/** The admin API calls of the analytics feature, over this host's `request`. */
export const analyticsApi = createAnalyticsApi({ request, workspaceId: WORKSPACE_ID });
