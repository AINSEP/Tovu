/**
 * @file `write-service.ts` — the admin-CRUD write chokepoint (SPEC-010 REQ-01..04, ADR-PIPE-010).
 *
 * Purpose:
 * `createFormDefinition`/`updateFormDefinition`/`setFormDefinitionStatus`, each wrapping the
 * existing core/commands `executeCommand` gateway (mirrors `posts/create.ts`'s pattern — the
 * gateway captures the auditable change-set record, authorizes `admin.forms.manage`, and enqueues
 * `change-set.applied` onto the outbox). Never exposes a delete: a form definition is removed
 * permanently only by a Trash purge (owner ruling 2026-09-21, superseding the original INV-08
 * "never deleted" wording) — the repo port itself has no delete method for this file to call.
 *
 * Slug-uniqueness relies on the DB unique index (`db/schema.sqlite.ts`), not an app-level check
 * (behavior.spec.md §6.1) — `repo.memory.ts`/`repo.ts` both map a conflicting insert to
 * `FormSlugConflictError`, which this file lets propagate unchanged out of `mutation.execute()`.
 */
// Validation/audited-write rationale: Jini/packages/cms/forms/src/write-service.ts (SPEC-010, ADR-PIPE-010).
import {
  createFormDefinition as createPackageFormDefinition,
  updateFormDefinition as updatePackageFormDefinition,
  setFormDefinitionStatus as setPackageFormDefinitionStatus,
  FormFieldValidationError,
  type FormWriteServiceDeps as PackageWriteDeps,
  type CreateFormDefinitionRequired as PackageCreateRequired,
  type UpdateFormDefinitionRequired as PackageUpdateRequired,
  type SetFormDefinitionStatusRequired as PackageStatusRequired,
  type NotifyConfig,
  type FormDefinitionRecord,
} from "@jini-ai/cms-forms";
import type { OutboxPort } from "@jini-ai/cms/core";
import { prepareFormAuthoring, withFormAuthoring } from "./authoring-adapter.js";
import type { FormAuthoring, HtmlFormDefinitionRecord } from "./html-authoring.js";

/** Tovu's command-gateway adapter. Policy stays here; validation and audited writes live in Jini. */
export interface FormWriteServiceDeps extends Omit<PackageWriteDeps, "permission" | "reservedSlugs"> {
  outbox?: OutboxPort;
}

/** The admin editor uses this slug for its create screen. */
// The editor's formId === "new" guard would render a blank create form at a saved form's own URL.
// Reserve it at the shared write boundary so agent-tool creation cannot bypass a UI-only check.
// Slugs are immutable after creation; updates retain the existing slug rather than choose a new one.
const RESERVED_SLUGS = new Set(["new"]);

const FORMS_PERMISSION = "admin.forms.manage";

export interface CreateFormDefinitionRequired {
  deps: FormWriteServiceDeps;
  input: PackageCreateRequired["input"] & FormAuthoring & { notify?: NotifyConfig; idempotencyKey?: string };
}
export interface UpdateFormDefinitionRequired {
  deps: FormWriteServiceDeps;
  input: Omit<PackageUpdateRequired["input"], "patch"> & { patch: PackageUpdateRequired["input"]["patch"] & FormAuthoring; idempotencyKey?: string };
}
export interface SetFormDefinitionStatusRequired {
  deps: FormWriteServiceDeps;
  input: PackageStatusRequired["input"] & { idempotencyKey?: string };
}

/** Binds the Forms permission and reserved route slug to the supplied host command executor. */
function packageDeps(deps: FormWriteServiceDeps): PackageWriteDeps {
  return {
    executeCommand: deps.executeCommand,
    repo: deps.repo,
    clock: deps.clock,
    idGen: deps.idGen,
    changeSets: deps.changeSets,
    authorize: deps.authorize,
    permission: FORMS_PERMISSION,
    reservedSlugs: RESERVED_SLUGS,
  };
}

/**
 * Creates an audited definition, translating Tovu's input and outbox into package options.
 * Preserves the editor-specific reserved-slug explanation; all other errors propagate unchanged.
 * @returns The created definition. @complexity O(f + r) package validation, one command.
 * @example await createFormDefinition({ deps, input: { workspaceId, actor, name, slug, fields } });
 */
export async function createFormDefinition(
  { deps, input }: CreateFormDefinitionRequired,
  _optional: Record<string, never> = {},
): Promise<{ definition: FormDefinitionRecord }> {
  const { notify, idempotencyKey, mode, html, ...requiredInput } = input;
  const authoring = await prepareFormAuthoring({ deps, input });
  const boundDeps = authoring ? { ...deps, repo: withFormAuthoring({ repo: deps.repo, authoring }) } : deps;
  if (authoring?.fields) requiredInput.fields = authoring.fields;
  try {
    return await createPackageFormDefinition(
      { deps: packageDeps(boundDeps), input: requiredInput },
      { notify, idempotencyKey, outbox: deps.outbox },
    );
  } catch (error) {
    if (error instanceof FormFieldValidationError && RESERVED_SLUGS.has(input.slug)) {
      throw new FormFieldValidationError({
        message: error.message,
        fieldErrors: error.fieldErrors.map((detail) =>
          detail.field === "slug" && detail.reason === `'${input.slug}' is reserved by the host`
            ? { ...detail, reason: `'${input.slug}' is reserved for the admin editor's own URL` }
            : detail,
        ),
      });
    }
    throw error;
  }
}

/** Updates through the injected command gateway; package rules preserve slugs and existing field ids.
 * @returns The updated definition; package validation and command errors propagate.
 * @complexity O(f + r) package validation, one command.
 */
export async function updateFormDefinition(
  { deps, input }: UpdateFormDefinitionRequired,
  _optional: Record<string, never> = {},
): Promise<{ definition: FormDefinitionRecord }> {
  const { idempotencyKey, patch, ...target } = input;
  const { mode, html, ...builderPatch } = patch;
  // Authorize BEFORE the authoring pre-read below, so a denied caller is refused before any
  // lookup and the refusal never discloses whether the form exists (5e9f338f6 put the read
  // first). The gateway then replays this one decision instead of evaluating a second time —
  // ADR-021 §2 "one evaluator". Its only authorize() caller is executeCommand's single gate,
  // pinned to FORMS_PERMISSION by packageDeps; prepareFormAuthoring keeps the real authorize.
  const decision = await deps.authorize({
    principalId: input.actor.id,
    permission: FORMS_PERMISSION,
    workspaceId: input.workspaceId,
    entityType: "form_definition",
    entityId: input.formId,
  });
  const gatewayDeps: FormWriteServiceDeps = { ...deps, authorize: async () => decision };
  const submit = (writeDeps: FormWriteServiceDeps, writePatch: PackageUpdateRequired["input"]["patch"]) =>
    updatePackageFormDefinition({ deps: packageDeps(writeDeps), input: { ...target, patch: writePatch } }, { idempotencyKey, outbox: deps.outbox });
  // Denied: skip the pre-read entirely; the gateway throws its own ForbiddenError.
  if (!decision.allowed) return submit(gatewayDeps, builderPatch);
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.formId }) as HtmlFormDefinitionRecord | null;
  const authoring = await prepareFormAuthoring({ deps, input: { ...target, ...patch }, existing: existing ?? undefined });
  const boundDeps = authoring ? {
    ...gatewayDeps,
    repo: withFormAuthoring({ repo: deps.repo, authoring }, { replaceFields: authoring.mode === "html" || (existing?.mode === "html" && patch.fields !== undefined) }),
  } : gatewayDeps;
  return submit(boundDeps, { ...builderPatch, ...(authoring?.fields ? { fields: authoring.fields } : {}) });
}

/** Changes active/disabled status through the audited command gateway; never deletes a definition.
 * @returns The updated definition; command/not-found errors propagate. @complexity O(1), one command.
 */
export function setFormDefinitionStatus(
  { deps, input }: SetFormDefinitionStatusRequired,
  _optional: Record<string, never> = {},
): Promise<{ definition: FormDefinitionRecord }> {
  const { idempotencyKey, ...requiredInput } = input;
  return setPackageFormDefinitionStatus(
    { deps: packageDeps(deps), input: requiredInput },
    { idempotencyKey, outbox: deps.outbox },
  );
}
