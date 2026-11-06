import { createFormCollectionRegistry, describeFormCollectionProviders } from "@jini-ai/cms/forms";
import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { FormsRouteRegistrar } from "./deps.js";

/** List public settings from the same current registry the assistant uses; no vendor or database I/O.
 * Registered before the form-id route so the discovery name cannot resolve as a form slug.
 * @complexity O(p) time/space for registered providers and their bounded public descriptions. */
export const registerAdminFormsProvidersRoute: FormsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/forms/_providers", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      const auth = await deps.authorize({ principalId: principal.id, permission: "admin.forms.manage", workspaceId: deps.workspaceId, entityType: "form_definition" });
      if (!auth.allowed) {
        res.status(403).json({ error: "You do not have permission to view form provider settings.", code: "FORBIDDEN", details: { permission: "admin.forms.manage", reason: auth.reason } });
        return;
      }
      res.json({ data: describeFormCollectionProviders({ providers: deps.formCollectionProviders?.() ?? createFormCollectionRegistry({}) }) });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/forms/_providers", code: "INTERNAL_ERROR" });
    }
  });
};
