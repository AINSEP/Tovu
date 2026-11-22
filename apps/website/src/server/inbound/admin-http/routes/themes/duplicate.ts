import { isReservedThemePreviewPath } from "#src/features/theme/preview-policy";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { DuplicateThemeError, duplicateDiscoveredTheme, validThemeIds, type DuplicateThemeErrorCode } from "#src/features/theme/index";
import { requestThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";
import { bodyRecord } from "./explore.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

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

/** Keep the HTTP body's coercion rules separate from the duplication service's validation. */
function duplicateInput({ body, sourceThemeId }: { body: unknown; sourceThemeId: unknown }, _optional = {}) {
  const record = bodyRecord({ body });
  return {
    sourceThemeId: String(sourceThemeId ?? ""),
    newName: String(record.newName ?? ""),
    newId: typeof record.newId === "string" && record.newId.length > 0 ? record.newId : undefined,
  };
}

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
export const registerAdminThemeDuplicateRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/duplicate", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "theme.edit", workspaceId: deps.workspaceId, entityType: "theme" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const { sourceThemeId, newName, newId } = duplicateInput({ body: req.body, sourceThemeId: req.params.themeId });
      const { result, theme } = duplicateDiscoveredTheme(
        { themes: deps.themes, themesDir: deps.themesDir, sourceThemeId, newName },
        { newId }
      );
      requestThemePreviewRefresh({ themesDir: deps.themesDir, isReservedPath: isReservedThemePreviewPath });

      res.status(201).json({
        theme: { id: result.id, name: result.name, tier: result.tier, status: theme?.status ?? "invalid", errors: theme?.errors ?? [] },
        sourceThemeId: result.sourceThemeId,
        files: result.files,
        availableThemeIds: validThemeIds({ themes: deps.themes }),
      });
    } catch (err) {
      if (err instanceof DuplicateThemeError) {
        res.status(DUPLICATE_ERROR_STATUS[err.code]).json({ error: err.message, code: err.code });
        return;
      }
      sendAdminFailure({ res, error: err }, { operation: "routes/themes/duplicate", code: "INTERNAL_ERROR" });
    }
  });
};
