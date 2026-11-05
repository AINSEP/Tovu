import { executeCommand } from "#src/contracts/core/commands/index";
import { trashedAtDestination } from "#src/features/publish-content/precheck-reasons";
import { createRepoPublishHandler, gatewayDeps } from "#src/features/publish-content/repo-handler";
import type { PublishContentContributor, PublishContentPorts } from "#src/features/publish-content/type-registry";

import { FormDefinitionNotFoundError, FormFieldValidationError, FormSlugConflictError } from "@jini-ai/cms/forms";
import type { FieldDescriptor, FormDefinitionStatus } from "@jini-ai/cms/forms";
import { createFormDefinition, setFormDefinitionStatus, updateFormDefinition } from "#src/features/forms/index";
import type { HtmlFormDefinitionRecord, FormAuthoring } from "@jini-ai/cms/forms";
import { FORMS_TABLES } from "./repo.sqlite.js";

/**
 * @file `form` on the publish factory (`features/publish-content/repo-handler.ts`). Carries the form's
 * structure only — submissions are visitor data and never travel (plan §1).
 *
 * Addressed by `slug`, not the row id: the site looks a form up by slug and the id is minted per
 * instance by `createFormDefinition`. The repo hides trashed rows, so a slug held only by a trashed
 * form is found through `isSlugTaken` and refused rather than planned as a create that would collide.
 */

/** Copy form structure through the existing publish factory; recipients remain site-local.
 * @complexity O(schema bytes) time/space per form; existing repo/command I/O only.
 * @overallScore 98 — Minor: the factory's typed state is trusted until existing command validation. */

export const contributeFormPublish = (): PublishContentContributor =>
  createRepoPublishHandler<HtmlFormDefinitionRecord, PublishContentPorts["form"]>({
    entityType: "form",
    coversTables: [FORMS_TABLES.definitions],
    permission: "admin.forms.manage",
    ports: (deps) => deps.ports.form,
    list: async (p, workspaceId) => (await p.repo.list({ workspaceId })).map(publishableForm),
    find: async (p, workspaceId, slug) => {
      const row = await p.repo.findBySlug({ workspaceId, slug });
      return row ? publishableForm(row) : null;
    },
    idOf: (row) => row.slug,
    fields: {
      name: "transferred",
      slug: "transferred",
      fields: "transferred",
      status: "transferred",
      notify: "local",
      mode: "transferred",
      html: "transferred",
      provider: "transferred",
      id: "local",
      workspaceId: "local",
      createdAt: "local",
      updatedAt: "local",
      version: "local",
    },
    validate: async ({ ports, workspaceId, entity, existing }) =>
      !existing && (await ports.repo.isSlugTaken({ workspaceId, slug: entity.id })) ? trashedAtDestination("form", entity.id) : null,
    write: async ({ ports, deps, workspaceId, id, state, existing, principalId }) => {
      const writeDeps = { ...gatewayDeps(deps, "form"), repo: ports.repo, executeCommand };
      const actor = { id: principalId, kind: "user" as const };
      const name = state.name as string;
      const fields = state.fields as FieldDescriptor[];
      const authoring = { ...(state.mode ? { mode: state.mode as NonNullable<FormAuthoring["mode"]> } : {}),
        ...(state.mode === "html" && typeof state.html === "string" ? { html: state.html } : {}),
        ...(state.provider ? { provider: state.provider as NonNullable<FormAuthoring["provider"]> } : {}) };
      // Recipients stay local even when an older bundle includes a notify value.
      const notify = existing?.notify;
      const { definition } = existing
        ? await updateFormDefinition({ deps: writeDeps, input: { workspaceId, actor, formId: existing.id, patch: { name, fields, notify, ...authoring } } })
        : await createFormDefinition({ deps: writeDeps, input: { workspaceId, actor, name, slug: id, fields, notify, ...authoring } });
      const status = state.status as FormDefinitionStatus;
      if (definition.status !== status) {
        await setFormDefinitionStatus({ deps: writeDeps, input: { workspaceId, actor, formId: definition.id, status } });
      }
    },
    errors: { blocked: [FormFieldValidationError, FormSlugConflictError], conflict: [FormDefinitionNotFoundError] },
  });


/** Canonical defaults make legacy Builder/built-in definitions replace an external destination,
 * rather than accidentally preserving its previous mode/provider through an omitted patch.
 * @complexity O(1) time/space; no I/O. @overallScore 100 */
function publishableForm(row: HtmlFormDefinitionRecord): HtmlFormDefinitionRecord {
  return { ...row, mode: row.mode ?? "builder", html: row.html ?? "", provider: row.provider ?? { id: "builtin", config: {} } };
}
