import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import {
  ADMIN_ASSISTANT_PERMISSION,
  PublicAssistantSettingsValidationError,
  setPublicAssistantSettings,
} from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps.js";
import { ValueValidationFailedError } from "#src/features/settings/index";

/**
 * PUT (partial) the workspace's `site.assistant.*` settings — the route the admin's AI Assistant
 * screen flips the public switch through. Mirrors `apps/website/src/server/inbound/admin-http/routes/seo/put-settings.ts` exactly: same
 * auth gate as the matching GET, same `{ data }` envelope, same 400-on-validation /
 * 500-on-everything-else split, and the same return of the settings AS THEY NOW READ so the client
 * renders the persisted truth rather than the value it optimistically sent.
 */
export const registerAdminAssistantPutSettingsRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/assistant/settings", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      await deps.assistantSettingsReady;
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: ADMIN_ASSISTANT_PERMISSION, workspaceId: deps.workspaceId, entityType: "assistant-settings" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const settings = await setPublicAssistantSettings(
        {
          settingsRepo: deps.settingsRepo,
          getEffective: deps.getEffective,
          set: deps.set,
          clock: deps.clock,
          ids: deps.idGen,
          authorize: deps.authorize,
          principals: deps.principalRepo,
        },
        { workspaceId: deps.workspaceId, patch: req.body ?? {}, callerPrincipalId: principal.id }
      );
      res.json({ data: settings });
    } catch (err) {
      if (err instanceof PublicAssistantSettingsValidationError || err instanceof ValueValidationFailedError) {
        res.status(400).json({ error: err.message, code: "ASSISTANT_SETTINGS_VALIDATION_ERROR" });
        return;
      }
      sendAdminFailure({ res, error: err }, { operation: "routes/assistant/put-settings", code: "INTERNAL_ERROR" });
    }
  });
};
