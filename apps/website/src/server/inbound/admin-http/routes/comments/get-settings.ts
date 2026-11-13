import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import type { Express } from "express";

import { getCommentsSettings } from "#src/features/comments/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import type { CommentsModerationRouteDeps } from "./deps.js";

/** GET workspace-level `comments.*` settings (SPEC-035, ADR-028 Settings Layered Ledger wiring
 * for Comments). Mirrors `apps/website/src/server/inbound/admin-http/routes/seo/get-settings.ts`'s exact shape.
 *
 * Retyped from the generic `RouteRegistrar` to `CommentsModerationRouteDeps` (ADR-046 Phase 3,
 * SPEC-040) — a genuine narrowing, not a widening; see `deps.ts`'s file header for the confirmed
 * field set. */
export const registerAdminCommentsGetSettingsRoute = (app: Express, deps: CommentsModerationRouteDeps): void => {
  app.get("/api/admin/v1/workspaces/:workspaceId/comments/settings", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      await deps.commentsSettingsReady;
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "comments.configure", workspaceId: deps.workspaceId, entityType: "comments-settings" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const settings = await getCommentsSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId });
      res.json({ data: settings });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/comments/get-settings", code: "INTERNAL_ERROR" });
    }
  });
};
