import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { authenticatedAdminRequest } from "../../../lib/admin-http/request";
import { querySuffix } from "../../../lib/query-suffix";
import type { AdminCommentsQueuePage, CommentStatus } from "./comments-api.types";

/** The admin API calls of the comments feature. */
export const commentsApi = {
  // Comments — the dashboard reads the queue here; moderation and settings use Jini.
  // Mirrors `getDatabaseTimeline`'s query-param-building shape for the paginated queue read.
  listCommentsQueue: (options: { status?: CommentStatus; cursor?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.status) params.set("status", options.status);
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return authenticatedAdminRequest<AdminCommentsQueuePage>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/comments/queue${querySuffix({ query: qs })}` });
  },
};
