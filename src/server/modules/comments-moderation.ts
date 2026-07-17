import { registerAdminCommentsGetSettingsRoute } from "../routes/admin/comments/get-settings";
import { registerAdminCommentsModerateRoutes } from "../routes/admin/comments/moderate";
import { registerAdminCommentsModerationQueueRoute } from "../routes/admin/comments/moderation-queue";
import { registerAdminCommentsPutSettingsRoute } from "../routes/admin/comments/put-settings";
import type { CommentsModerationRouteDeps } from "../routes/admin/comments/deps";
import type { ServerModuleHandle } from "./types";

/**
 * @file ADR-046 Phase 3 (SPEC-040) — the `comments-moderation` server module (ADR-031 §6/§9
 * admin moderation queue/actions + SPEC-035 admin settings).
 *
 * Named distinctly from any future public-facing `comments.ts` module — this domain is ADMIN
 * moderation only (the queue read, the 5 moderation actions, and the settings GET/PUT), not the
 * already-shipped Comments admin FRONTEND (SPEC-036/037, unrelated UI work) and not the public
 * comment-submission route (`routes/site/comments-submit.ts`, which stays inline in `app.ts` —
 * unauthenticated site-facing surface, same reasoning as `content.ts`'s public post-get route).
 *
 * Owns the 4 registrations (moderation-queue, moderate, get-settings, put-settings) — moved here
 * verbatim from `app.ts`'s `createApp()`, same registrar function bodies, no behavior change,
 * same relative order.
 */
export function createCommentsModerationModule(deps: CommentsModerationRouteDeps): ServerModuleHandle {
  return {
    name: "comments-moderation",
    registerRoutes: (app) => {
      registerAdminCommentsModerationQueueRoute(app, deps);
      registerAdminCommentsModerateRoutes(app, deps);
      registerAdminCommentsGetSettingsRoute(app, deps);
      registerAdminCommentsPutSettingsRoute(app, deps);
    },
  };
}
