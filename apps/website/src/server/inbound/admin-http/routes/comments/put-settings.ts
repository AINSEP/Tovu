import type { Express } from "express";

import { CommentsSettingsValidationError, setCommentsSettings } from "#src/features/comments/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { CommentsModerationRouteDeps } from "./deps.js";

/** PUT (partial) workspace-level `comments.*` settings (SPEC-035, ADR-028 Settings Layered
 * Ledger wiring for Comments). Mirrors `routes/admin/seo/put-settings.ts`'s exact shape.
 *
 * Retyped from the generic `RouteRegistrar` to `CommentsModerationRouteDeps` (ADR-046 Phase 3,
 * SPEC-040) — a genuine narrowing, not a widening; see `deps.ts`'s file header for the confirmed
 * field set. */
export const registerAdminCommentsPutSettingsRoute = (app: Express, deps: CommentsModerationRouteDeps): void => {
  app.put("/api/admin/v1/workspaces/:workspaceId/comments/settings", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.commentsSettingsReady;
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "comments.configure",
        workspaceId: deps.workspaceId,
        entityType: "comments-settings",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'comments.configure' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "comments.configure", reason: authResult.reason },
        });
        return;
      }

      const settings = await setCommentsSettings(
        {
          settingsRepo: deps.settingsRepo,
          clock: deps.clock,
          ids: deps.idGen,
          authorize: deps.authorize,
          principals: deps.principalRepo,
        },
        { workspaceId: deps.workspaceId, patch: req.body ?? {}, callerPrincipalId: principal.id }
      );
      res.json({ data: settings });
    } catch (err) {
      if (err instanceof CommentsSettingsValidationError) {
        res.status(400).json({ error: err.message, code: "COMMENTS_SETTINGS_VALIDATION_ERROR" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
