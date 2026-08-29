import { ADMIN_ASSISTANT_PERMISSION, getPublicAssistantSettings } from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps.js";

/**
 * GET the workspace's `site.assistant.*` settings — today, the public assistant's master on/off
 * switch. Shape and error contract copied from `routes/admin/seo/get-settings.ts` deliberately, down
 * to the 404-on-workspace-mismatch and the `{ data }` envelope, so the admin client's existing
 * `request()` helper needs no special case.
 *
 * Also returns a sibling `adminAssistantEnabled` field — the (unrelated) ADMIN assistant's own
 * `TOVU_ADMIN_ASSISTANT=off` switch, NOT part of the `site.assistant.*` ledger `settings` above and
 * deliberately not folded into it (`getPublicAssistantSettings`'s own header scopes that function to
 * the public-assistant SETTING and nothing else). Piggy-backed onto this response rather than a new
 * endpoint because this module is one of exactly two admin-assistant server modules mounted
 * UNCONDITIONALLY (`server/app.ts`'s module-mounting comment) — the four gated modules 404 with the
 * flag off, so they cannot tell the client anything, but this route always can. The admin SPA reads
 * it to decide whether to mount its own chat dock (`AssistantDock`/`ChatFab`) at all.
 */
export const registerAdminAssistantGetSettingsRoute: AssistantSettingsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/assistant/settings", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.assistantSettingsReady;
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: ADMIN_ASSISTANT_PERMISSION,
        workspaceId: deps.workspaceId,
        entityType: "assistant-settings",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for '${ADMIN_ASSISTANT_PERMISSION}' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: ADMIN_ASSISTANT_PERMISSION, reason: authResult.reason },
        });
        return;
      }

      const settings = await getPublicAssistantSettings(
        { settingsRepo: deps.settingsRepo, getEffective: deps.getEffective },
        { workspaceId: deps.workspaceId }
      );
      res.json({ data: settings, adminAssistantEnabled: deps.adminAssistantEnabled });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
