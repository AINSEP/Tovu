import { sitesApi } from "@/features/sites/api/sites-api";
import { mediaApi } from "@/features/media/api/media-api";
import { themesApi } from "@/features/themes/api/themes-api";
import { postsApi } from "@/features/posts/api/posts-api";
import { authApi } from "@/features/auth/api/auth-api";
import { pagesApi } from "@/features/pages/api/pages-api";
import { commentsApi } from "@/features/comments/api/comments-api";
import type { DashboardPort } from "@jini-ai/admin/screens/dashboard/hooks/dashboard-port.hooks";

/**
 * @file The only place under `features/dashboard` that reaches `lib/api` — the host adapter that
 * binds this app's API clients into `@jini-ai/admin`'s `DashboardPort` (see that file for why the
 * split exists). Its in-memory twin, `createFakeDashboardPort`, ships beside the port.
 */

/** The live implementation, as a module-level singleton. Each method wraps its `api` counterpart
 *  explicitly rather than pointing at it directly, matching `media-dependencies.hooks.ts`'s own
 *  reasoning — a route's own parameter shape (`listCommentsQueue`'s `options`) stays `lib/api.ts`'s
 *  to own. */
export const defaultDashboardPort: DashboardPort = {
  listPosts: () => postsApi.listPosts(),
  listPages: () => pagesApi.listPages(),
  listMedia: () => mediaApi.listMedia(),
  listCommentsQueue: (options, _optional = {}) => commentsApi.listCommentsQueue(options),
  getPresentation: () => themesApi.getPresentation(),
  getPasswordStatus: async ({ principalId } = {}) => {
    // App already authenticated this principal. Standalone dashboard consumers still resolve it.
    const [status, id] = await Promise.all([authApi.getPasswordStatus(), principalId ?? authApi.me().then(me => me.user.id)]);
    return { usesDefaultPassword: status.usesDefaultPassword, principalId: id };
  },
  getSiteKeyState: async () => {
    const status = await sitesApi.getSiteKeyStatus();
    return { state: status.state };
  },
};
