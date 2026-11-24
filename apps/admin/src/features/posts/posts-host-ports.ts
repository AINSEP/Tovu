import { BASE, WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { bodyFitsKeepalive, request } from "@/lib/admin-http/request";
import { siteUrl } from "@/lib/site-url";
import { createPostsApi } from "@jini-ai/admin/posts/api/posts-api";

/**
 * @file The admin's posts bindings: `@jini-ai/admin`'s posts API client, bound once to this host's
 * authenticated `request`, its workspace, its API base path, `siteUrl` (dev-origin escape for the
 * template-preview iframe) and the keepalive body-size check. Every posts/pages caller and the
 * `lib/__tests__` request-shape suites read this singleton; nothing else builds it.
 */

/** The admin API calls of the posts feature, over this host's `request`. */
export const postsApi = createPostsApi({ request, workspaceId: WORKSPACE_ID, base: BASE, siteUrl, bodyFitsKeepalive });
