import { DuplicateThemeError, duplicateDiscoveredTheme, requestThemePreviewRefresh, validThemeIds, type DuplicateThemeErrorCode } from "#src/features/theme/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";
import { bodyRecord } from "./explore.js";

/** HTTP status per refusal: an unknown source is a 404, a taken id a 409, everything else bad input. */
const DUPLICATE_ERROR_STATUS: Record<DuplicateThemeErrorCode, number> = {
  SOURCE_NOT_FOUND: 404,
  ID_TAKEN: 409,
  INVALID_NAME: 400,
  INVALID_ID: 400,
  SOURCE_NOT_COPYABLE: 400,
  SYMLINK: 400,
  TOO_LARGE: 400,
  BAD_MANIFEST: 400,
};

/**
 * POST — duplicate one discovered theme into a new theme folder (the Themes screen's Duplicate
 * action). Body: `{ newName: string, newId?: string }`.
 *
 * Calls `duplicateDiscoveredTheme`, the SAME service the `theme_duplicate` agent tool calls
 * (`features/theme/duplicate-theme-tool.ts`) — what id a copy gets and what is refused cannot differ
 * between the screen and the assistant. The service rescans before returning, so the copy is
 * already in `deps.themes` and the response's `availableThemeIds` includes it.
 *
 * Gated on `theme.edit` (the tool's permission, and `pages/update-html.ts`'s): this creates theme
 * source, which is more than `theme.set`'s "choose among existing themes". Never activates — the
 * screen's own Activate button does that as a separate, deliberate step.
 */
export const registerAdminThemeDuplicateRoute: ContentRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/duplicate", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "theme.edit",
        workspaceId: deps.workspaceId,
        entityType: "theme",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'theme.edit' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "theme.edit", reason: authResult.reason },
        });
        return;
      }

      const body = bodyRecord(req.body);
      const newId = typeof body.newId === "string" && body.newId.length > 0 ? body.newId : undefined;
      const { result, theme } = duplicateDiscoveredTheme(
        { themes: deps.themes, themesDir: deps.themesDir, sourceThemeId: String(req.params.themeId ?? ""), newName: String(body.newName ?? "") },
        { newId }
      );
      requestThemePreviewRefresh({ themesDir: deps.themesDir });

      res.status(201).json({
        theme: { id: result.id, name: result.name, tier: result.tier, status: theme?.status ?? "invalid", errors: theme?.errors ?? [] },
        sourceThemeId: result.sourceThemeId,
        files: result.files,
        availableThemeIds: validThemeIds(deps.themes),
      });
    } catch (err) {
      if (err instanceof DuplicateThemeError) {
        res.status(DUPLICATE_ERROR_STATUS[err.code]).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};
