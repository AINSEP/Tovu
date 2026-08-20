import { mapFormsWriteError, toAdminFormDefinitionResponse } from "#src/server/http/admin/forms";
import { createFormDefinition } from "#src/forms/write-service";
import type { FieldDescriptor, NotifyConfig } from "#src/forms/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { FormsRouteRegistrar } from "./deps.js";

/** This route's four writable POST fields, read off an untyped body in one place.
 *  @complexity O(1). */
function parseFormCreateBody(rawBody: unknown): {
  name: string;
  slug: string;
  fields: FieldDescriptor[];
  notify: NotifyConfig | undefined;
} {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    name: String(body.name ?? ""),
    slug: String(body.slug ?? ""),
    fields: Array.isArray(body.fields) ? (body.fields as FieldDescriptor[]) : [],
    notify: body.notify as NotifyConfig | undefined,
  };
}

/**
 * POST a new form definition (`FORMS_CREATE_DEFINITION`, REQ-01). Routed through
 * `write-service.ts`'s `createFormDefinition`, which wraps `executeCommand` (authorizes
 * `admin.forms.manage` internally — mirrors `posts/create.ts`, no separate pre-check needed).
 */
export const registerAdminFormsCreateRoute: FormsRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/forms", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const idempotencyKey = req.get("Idempotency-Key") || undefined;

      const { definition } = await createFormDefinition({
        deps: {
          repo: deps.formDefinitionRepo,
          clock: deps.clock,
          idGen: deps.idGen,
          changeSets: deps.changeSets,
          outbox: deps.outbox,
          authorize: deps.authorize,
        },
        input: {
          workspaceId: deps.workspaceId,
          actor: { id: principal.id, kind: "user" },
          ...parseFormCreateBody(req.body),
          idempotencyKey,
        },
      });

      res.status(201).json(toAdminFormDefinitionResponse(definition));
    } catch (err) {
      if (mapFormsWriteError(err, res)) return;
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
