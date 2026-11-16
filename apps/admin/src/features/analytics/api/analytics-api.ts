import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import { querySuffix } from "../../../lib/query-suffix";
import type { AdminAnalyticsHit } from "./analytics-api.types";

/** The admin API calls of the analytics feature. */
export const analyticsApi = {
  listRecentAnalyticsHits: (options: { limit?: number } = {}) =>
    request<{ hits: AdminAnalyticsHit[] }>(
      { path: `/workspaces/${WORKSPACE_ID}/analytics/recent-hits${querySuffix({ query: options.limit ? "limit=" + options.limit : "" })}` }
    ),
};
