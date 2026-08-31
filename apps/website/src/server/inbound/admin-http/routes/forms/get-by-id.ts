import { toAdminFormDefinitionResponse } from "#src/server/inbound/admin-http/http/forms";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { FormsRouteRegistrar } from "./deps.js";

/** GET one form definition by id (`FORMS_GET_DEFINITION`, REQ-04). */
export const registerAdminFormsGetRoute: FormsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/forms/:formId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const formId = String(req.params.formId ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.forms.manage",
        workspaceId: deps.workspaceId,
        entityType: "form_definition",
        entityId: formId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.forms.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.forms.manage", reason: authResult.reason },
        });
        return;
      }

      // Admin URLs use the slug when one resolves (ui-fixes-backlog.md #8 — the raw id was
      // unreadable in the URL bar); this route accepts either so an old id-based bookmark/link
      // keeps working. Slug first, id second — same order and rationale as posts' own
      // `getAdminPostByIdOrSlug` (`src/features/post/post.ts`): the slug is the handle a human
      // chose and reads, the id is an implementation detail they never did. Inlined rather than
      // promoted to a shared helper — forms carry no trash concept (unlike posts) and this is the
      // only caller; every WRITE below resolves through the loaded record's real `.id` instead of
      // this route param, so the PUT route needs no matching id-or-slug support (see
      // `use-form-editor.hooks.ts`'s own comment on its update mutation).
      const bySlug = await deps.formDefinitionRepo.findBySlug({
        workspaceId: deps.workspaceId,
        slug: formId.trim().toLowerCase(),
      });
      const definition = bySlug ?? (await deps.formDefinitionRepo.findById({ workspaceId: deps.workspaceId, id: formId }));
      if (!definition) {
        res.status(404).json({ error: `form definition '${formId}' was not found`, code: "FORMS_DEFINITION_NOT_FOUND" });
        return;
      }
      res.json(toAdminFormDefinitionResponse(definition));
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
