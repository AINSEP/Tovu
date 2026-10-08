import { updateFormDefinition } from "#src/features/forms/index";
import type { FieldDescriptor, NotifyConfig } from "@jini-ai/cms/forms";
import type { FormAuthoring } from "@jini-ai/cms/forms/html";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { mapFormsWriteError, toAdminFormDefinitionResponse } from "#src/server/inbound/admin-http/http/forms";
import type { FormsRouteRegistrar } from "./deps.js";

/** Separate authoring endpoint avoids changing the shared-tree CRUD route. Both permissions and
 * the audit boundary live in the write service, covering route and future tool callers alike. */
export const registerAdminFormsAuthoringRoute: FormsRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/forms/:formId/authoring", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const principal = getAuthedPrincipal(res);
      const formId = String(req.params.formId ?? "");
      // Same gate as `update.ts` (f07a92dcb): an empty/ignored body never reaches the write
      // service's gateway, and the write service's own pre-read must not disclose a form's
      // existence to a caller the matching GET denies.
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "admin.forms.manage",
        workspaceId: deps.workspaceId,
        entityType: "form_definition",
        entityId: formId,
      });
      if (!authorized) return;
      const { definition } = await updateFormDefinition({
        deps: { ...deps, repo: deps.formDefinitionRepo },
        input: {
          workspaceId: deps.workspaceId,
          formId,
          actor: { id: principal.id, kind: "user" },
          idempotencyKey: req.get("Idempotency-Key") || undefined,
          patch: {
            ...(typeof body.name === "string" ? { name: body.name } : {}),
            ...(Array.isArray(body.fields) ? { fields: body.fields as FieldDescriptor[] } : {}),
            ...(body.notify !== undefined ? { notify: body.notify as NotifyConfig } : {}),
            ...(body.mode !== undefined ? { mode: body.mode as FormAuthoring["mode"] } : {}),
            ...(body.html !== undefined ? { html: body.html as string } : {}),
          },
        },
      });
      res.json(toAdminFormDefinitionResponse(definition));
    } catch (error) {
      if (mapFormsWriteError(error, res)) return;
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
