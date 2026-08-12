import { mapFormsWriteError, toAdminFormDefinitionResponse } from "#src/server/http/admin/forms";
import {
  FormDefinitionNotFoundError,
  type FieldDescriptor,
  type FormDefinitionStatus,
  type NotifyConfig,
} from "#src/forms/index";
import { setFormDefinitionStatus, updateFormDefinition } from "#src/forms/write-service";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { FormsRouteRegistrar } from "./deps";

const VALID_STATUSES: readonly FormDefinitionStatus[] = ["active", "disabled"];

/**
 * PUT (partial) update a form definition, including the `status` toggle (`FORMS_UPDATE_DEFINITION`,
 * REQ-04). `slug` is deliberately ignored if present in the body (behavior.spec.md §1.1 — handled
 * inside `write-service.ts`'s `updateFormDefinition`, which never reads `patch.slug`).
 */
export const registerAdminFormsUpdateRoute: FormsRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/forms/:formId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const formId = String(req.params.formId ?? "");
    const body = (req.body ?? {}) as Record<string, unknown>;

    try {
      const principal = getAuthedPrincipal(res);
      const actor = { id: principal.id, kind: "user" as const };
      const writeDeps = {
        repo: deps.formDefinitionRepo,
        clock: deps.clock,
        idGen: deps.idGen,
        changeSets: deps.changeSets,
        outbox: deps.outbox,
        authorize: deps.authorize,
      };

      const patch: { name?: string; fields?: FieldDescriptor[]; notify?: NotifyConfig } = {};
      if (typeof body.name === "string") patch.name = body.name;
      if (Array.isArray(body.fields)) patch.fields = body.fields as FieldDescriptor[];
      if (body.notify !== undefined) patch.notify = body.notify as NotifyConfig;

      let definition = undefined;
      if (Object.keys(patch).length > 0) {
        ({ definition } = await updateFormDefinition({
          deps: writeDeps,
          input: { workspaceId: deps.workspaceId, actor, formId, patch },
        }));
      }

      if (typeof body.status === "string" && VALID_STATUSES.includes(body.status as FormDefinitionStatus)) {
        ({ definition } = await setFormDefinitionStatus({
          deps: writeDeps,
          input: { workspaceId: deps.workspaceId, actor, formId, status: body.status as FormDefinitionStatus },
        }));
      }

      if (!definition) {
        definition = await deps.formDefinitionRepo.findById({ workspaceId: deps.workspaceId, id: formId });
        if (!definition) {
          throw new FormDefinitionNotFoundError(`form definition '${formId}' was not found`);
        }
      }

      res.json(toAdminFormDefinitionResponse(definition));
    } catch (err) {
      if (mapFormsWriteError(err, res)) return;
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
