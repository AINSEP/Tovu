import { mapFormsWriteError, toAdminFormDefinitionResponse } from "#src/server/http/admin/forms";
import {
  FormDefinitionNotFoundError,
  type FieldDescriptor,
  type FormDefinitionRecord,
  type FormDefinitionRepoPort,
  type FormDefinitionStatus,
  type NotifyConfig,
} from "#src/forms/index";
import {
  setFormDefinitionStatus,
  updateFormDefinition,
  type FormWriteServiceDeps,
} from "#src/forms/write-service";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { FormsRouteRegistrar } from "./deps.js";

const VALID_STATUSES: readonly FormDefinitionStatus[] = ["active", "disabled"];

/**
 * Applies the PATCH body's field patch and/or status change (each optional, either or both may
 * apply), then falls back to a plain read when neither ran — a request with no recognized fields is
 * a no-op read, not an error, unless the form itself doesn't exist.
 *
 * @throws {FormDefinitionNotFoundError} if neither write ran and the form id doesn't exist either.
 * @complexity O(1) — at most two writes and one read.
 */
async function resolveFormUpdateResult(
  writeDeps: FormWriteServiceDeps,
  repo: FormDefinitionRepoPort,
  params: { workspaceId: string; actor: { id: string; kind: "user" }; formId: string; body: Record<string, unknown> }
): Promise<FormDefinitionRecord> {
  const { workspaceId, actor, formId, body } = params;

  const patch: { name?: string; fields?: FieldDescriptor[]; notify?: NotifyConfig } = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (Array.isArray(body.fields)) patch.fields = body.fields as FieldDescriptor[];
  if (body.notify !== undefined) patch.notify = body.notify as NotifyConfig;

  let definition: FormDefinitionRecord | undefined;
  if (Object.keys(patch).length > 0) {
    ({ definition } = await updateFormDefinition({ deps: writeDeps, input: { workspaceId, actor, formId, patch } }));
  }

  if (typeof body.status === "string" && VALID_STATUSES.includes(body.status as FormDefinitionStatus)) {
    ({ definition } = await setFormDefinitionStatus({
      deps: writeDeps,
      input: { workspaceId, actor, formId, status: body.status as FormDefinitionStatus },
    }));
  }

  if (definition) {
    return definition;
  }

  const existing = await repo.findById({ workspaceId, id: formId });
  if (!existing) {
    throw new FormDefinitionNotFoundError(`form definition '${formId}' was not found`);
  }
  return existing;
}

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

      const definition = await resolveFormUpdateResult(writeDeps, deps.formDefinitionRepo, {
        workspaceId: deps.workspaceId,
        actor,
        formId,
        body,
      });

      res.json(toAdminFormDefinitionResponse(definition));
    } catch (err) {
      if (mapFormsWriteError(err, res)) return;
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
