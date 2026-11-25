import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { authenticatedAdminRequest } from "../../lib/admin-http/request";
import { createCommentsApi } from "@jini-ai/admin/screens/comments/api/comments-api";

/**
 * @file The admin's comments bindings: `@jini-ai/admin`'s comments API client bound once to this host's
 * authenticated request and workspace. Every comments caller (and the request-shape suites that spy on
 * it) reads this singleton; nothing else builds it.
 */

/** The admin API calls of the comments feature, over this host's authenticated request. */
export const commentsApi = createCommentsApi({ request: authenticatedAdminRequest, workspaceId: WORKSPACE_ID });
