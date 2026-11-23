import type { Express } from "express";

import { commentsGetSettingsRoute } from "@jini-ai/cms/admin-http/routes/comments/get-settings";
import { commentsModerationActionRoutes, commentsPurgeRoute } from "@jini-ai/cms/admin-http/routes/comments/moderate";
import { commentsModerationQueueRoute } from "@jini-ai/cms/admin-http/routes/comments/moderation-queue";
import { commentsPutSettingsRoute } from "@jini-ai/cms/admin-http/routes/comments/put-settings";
import type { CommentRepoPort, CommentWriteService } from "@jini-ai/cms/comments";
import { getCommentsSettings, setCommentsSettings } from "#src/features/comments/index";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { CommentsModerationRouteDeps } from "#src/server/inbound/admin-http/routes/comments/deps";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

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
 * verbatim from `app.ts`'s `createApp()`, same relative order. Each is a Jini route spec
 * (`@jini-ai/cms/admin-http/routes/comments/*`) mounted behind the admin ports with its own small
 * deps; the settings ledger read/write stays here and is injected as a bound function.
 */

/** The moderation-queue registrar's deps (ADR-031 §6, SPEC-033). */
export type AdminCommentsModerationQueueDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & { commentRepo: CommentRepoPort };

/** The moderation-actions registrar's deps (ADR-031 §6/§9, SPEC-033). */
export type AdminCommentsModerateDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & { commentWriteService: CommentWriteService };

/** The two port fields every comments mount passes; `authorize` is read per request. */
function commentsPortDeps({ deps }: { deps: Pick<RouteDeps, "workspaceId" | "authorize"> }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** These routes never consulted the publishing-credential override (`authorizeDirectOrRespond`). */
const directMountOptions = (operation: string) => ({ authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } });

export function registerAdminCommentsModerationQueueRoute({ app, deps }: { app: Express; deps: AdminCommentsModerationQueueDeps }, _optional: Record<string, never> = {}): void {
  mountAdminJsonRoute({ app, spec: commentsModerationQueueRoute, deps: { ...commentsPortDeps({ deps }), commentRepo: deps.commentRepo } }, directMountOptions("routes/comments/moderation-queue"));
}

/** approve/spam/trash/restore first, then purge — the hand-written registrar's order. */
export function registerAdminCommentsModerateRoutes({ app, deps }: { app: Express; deps: AdminCommentsModerateDeps }, _optional: Record<string, never> = {}): void {
  const routeDeps = { ...commentsPortDeps({ deps }), commentWriteService: deps.commentWriteService };
  for (const spec of [...commentsModerationActionRoutes, commentsPurgeRoute]) {
    mountAdminJsonRoute({ app, spec, deps: routeDeps }, directMountOptions("routes/comments/moderate"));
  }
}

export const registerAdminCommentsGetSettingsRoute = ({ app, deps }: { app: Express; deps: CommentsModerationRouteDeps }, _optional: Record<string, never> = {}): void => {
  mountAdminJsonRoute({ app, spec: commentsGetSettingsRoute, deps: {
    ...commentsPortDeps({ deps }),
    commentsSettingsReady: deps.commentsSettingsReady,
    getCommentsSettings: ({ workspaceId }) => getCommentsSettings({ settingsRepo: deps.settingsRepo }, { workspaceId }),
  } }, directMountOptions("routes/comments/get-settings"));
};

export const registerAdminCommentsPutSettingsRoute = ({ app, deps }: { app: Express; deps: CommentsModerationRouteDeps }, _optional: Record<string, never> = {}): void => {
  mountAdminJsonRoute({ app, spec: commentsPutSettingsRoute, deps: {
    ...commentsPortDeps({ deps }),
    commentsSettingsReady: deps.commentsSettingsReady,
    setCommentsSettings: (input) => setCommentsSettings(
      { settingsRepo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, authorize: deps.authorize, principals: deps.principalRepo },
      input,
    ),
  } }, directMountOptions("routes/comments/put-settings"));
};

export function createCommentsModerationModule(deps: CommentsModerationRouteDeps): ServerModuleHandle {
  return {
    name: "comments-moderation",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminCommentsModerationQueueRoute({ app, deps });
      registerAdminCommentsModerateRoutes({ app, deps });
      registerAdminCommentsGetSettingsRoute({ app, deps });
      registerAdminCommentsPutSettingsRoute({ app, deps });
    },
  };
}
