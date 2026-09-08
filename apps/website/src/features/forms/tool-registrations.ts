/**
 * @file Forms' half of ADR-049 Decision 4 (SPEC-010): maps `agent-tools.ts`'s five catalog entries
 * onto the three `write-service.ts` operations plus the two submission reads, as `ToolRegistration`s.
 *
 * `ToolPolicy.authorize` is a pass-through for all five (see `buildDomainRegistrations`), because
 * ADR-021 §2 is "one evaluator". For the three definition tools, `admin.forms.manage` is enforced
 * one layer down by `executeCommand` inside every one of the three write-service functions, against
 * the SAME `authorize()` the human admin routes use. For the two submission tools, there is no
 * domain service layer to inherit a gate from — `formSubmissionRepo`/`formDefinitionRepo` are read
 * directly, exactly like `routes/admin/forms/{list,get}-submissions.ts` — so their handlers below
 * call `requireToolPermission` explicitly, in the route's place, the same pattern
 * `comments/tool-registrations.ts` uses for `comments_list_moderation_queue`. A second check on the
 * three self-enforcing tools would be a duplicate evaluator, and a `ToolPolicy`-only check would be
 * bypassable by any future non-tool caller of the same domain function.
 */
import type { AuthorizeFn, ChangeSetRepoPort } from "../../contracts/core/commands/index.js";
import {
  type OutboxPort,
  AGENT_TOOL_PRINCIPAL_KIND,
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireString,
  requireToolPermission,
  withSchemaOnRejection,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";
import type { ToolContributor, DuplicateResourceHandlerContributor } from "#src/assistant/index";
import { formsAgentToolCatalog } from "./agent-tools.js";
import { deriveAvailableFormSlug } from "./duplicate-slug.js";
import { FormDefinitionNotFoundError, FormFieldValidationError } from "./errors.js";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "./ports.js";
import type {
  FieldDescriptor,
  FormDefinitionRecord,
  FormDefinitionStatus,
  FormSubmissionRecord,
  NotifyConfig,
} from "./types.js";
import {
  createFormDefinition,
  setFormDefinitionStatus,
  updateFormDefinition,
} from "./write-service.js";

const SUBMISSIONS_DEFAULT_LIMIT = 50;
const SUBMISSIONS_MIN_LIMIT = 1;
const SUBMISSIONS_MAX_LIMIT = 100;

const CATALOG_BY_ID = indexCatalogById(formsAgentToolCatalog);

/**
 * The exact slice of the route-deps bag Forms' tool handlers read. Declared structurally (rather
 * than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge into the
 * composition root. `server/routes/*` satisfies this structurally by passing its existing
 * `RouteDeps` object; nothing there changes.
 */
export interface FormsToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  changeSets: ChangeSetRepoPort;
  outbox: OutboxPort;
  formDefinitionRepo: FormDefinitionRepoPort;
  formSubmissionRepo: FormSubmissionRepoPort;
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const formsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> formDefinitionRepo.list: one unfiltered read, no write of any kind.
  ["forms_list_definitions", "none"],
  // -> createFormDefinition (write-service.ts): executeCommand -> repo.create + change-set + outbox.
  ["forms_create_definition", "mutates-durable-state"],
  // -> updateFormDefinition (write-service.ts): executeCommand -> repo.update + change-set + outbox.
  ["forms_update_definition", "mutates-durable-state"],
  // -> setFormDefinitionStatus (write-service.ts): executeCommand -> repo.update (status flip) +
  //    change-set + outbox. Never a delete: FormDefinitionRepoPort exposes no delete method (INV-08).
  ["forms_set_definition_status", "mutates-durable-state"],
  // -> formSubmissionRepo.listByDefinition: one paginated read, no write of any kind.
  ["forms_list_submissions", "none"],
  // -> formSubmissionRepo.findById: one read, no write of any kind.
  ["forms_get_submission", "none"],
]);

/**
 * The only Forms rejection worth decorating with the published schema.
 *
 * A `ForbiddenError` or `FormSlugConflictError` is not a shape problem, and appending a schema to
 * those would be noise the model must read past — worse, it would imply the call is retryable.
 */
function isFormsShapeRejection(error: unknown): boolean {
  return error instanceof FormFieldValidationError;
}

/** What a Forms tool returns to the model — see {@link toFormDefinitionView}. */
interface FormDefinitionToolView {
  id: string;
  name: string;
  slug: string;
  status: FormDefinitionStatus;
  fields: FieldDescriptor[];
  notify: NotifyConfig;
}

/**
 * Projects a `FormDefinitionRecord` into an explicit model-facing shape rather than returning the
 * domain record verbatim — the same discipline content-types' `toContentTypeView` applies.
 *
 * `workspaceId` is dropped (the agent is already scoped to one workspace it cannot change, so the
 * id can never inform a decision) along with `createdAt`/`updatedAt` (timestamps no follow-up call
 * consumes). `id` is deliberately KEPT: every mutating Forms tool takes `formId`, so the model
 * needs it to make a correct follow-up call without re-reading. `slug` is kept because it is
 * immutable and is what a human will recognize the form by.
 *
 * @param record - The definition as the domain returned it.
 * @returns The model-facing view, with `fields`/`notify.recipients` copied so a tool caller cannot
 * mutate domain state through the returned object.
 * @complexity O(f) in the field count.
 * @overallScore 100
 */
function toFormDefinitionView(record: FormDefinitionRecord): FormDefinitionToolView {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    status: record.status,
    fields: record.fields.map((field) => ({ ...field })),
    notify: { enabled: record.notify.enabled, recipients: [...record.notify.recipients] },
  };
}

/** What a submission tool returns to the model — see {@link toFormSubmissionView}. */
interface FormSubmissionToolView {
  id: string;
  formDefinitionId: string;
  data: Record<string, string | boolean>;
  sourceIp: string;
  submittedAt: string;
}

/**
 * Projects a `FormSubmissionRecord` into the explicit model-facing shape, the same discipline
 * `toFormDefinitionView` applies just above. `workspaceId` is dropped for the identical reason —
 * the agent is already scoped to one workspace it cannot change. `sourceIp` is deliberately KEPT:
 * it is the same field value the human admin submissions screen already displays under this same
 * `admin.forms.submissions.read` permission (see `agent-tools.ts`'s file header), not a new
 * exposure this tool introduces.
 *
 * @param record - The submission as the domain returned it.
 * @returns The model-facing view, with `data` copied so a tool caller cannot mutate domain state
 * through the returned object.
 * @complexity O(f) in the submission's field count.
 * @overallScore 100
 */
function toFormSubmissionView(record: FormSubmissionRecord): FormSubmissionToolView {
  return {
    id: record.id,
    formDefinitionId: record.formDefinitionId,
    data: { ...record.data },
    sourceIp: record.sourceIp,
    submittedAt: record.submittedAt,
  };
}

/** Reads and range-checks `limit`, mirroring `routes/admin/forms/list-submissions.ts`'s own check. */
function requireSubmissionsLimit(input: Record<string, unknown>): number {
  if (input.limit === undefined) return SUBMISSIONS_DEFAULT_LIMIT;
  const limit = input.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < SUBMISSIONS_MIN_LIMIT || limit > SUBMISSIONS_MAX_LIMIT) {
    throw new Error(`'limit' must be an integer between ${SUBMISSIONS_MIN_LIMIT} and ${SUBMISSIONS_MAX_LIMIT}`);
  }
  return limit;
}

function formsDeps(routeDeps: FormsToolDeps) {
  return {
    repo: routeDeps.formDefinitionRepo,
    clock: routeDeps.clock,
    idGen: routeDeps.idGen,
    changeSets: routeDeps.changeSets,
    outbox: routeDeps.outbox,
    authorize: routeDeps.authorize,
  };
}

function requireFormsStatus(input: Record<string, unknown>): FormDefinitionStatus {
  const value = input.status;
  if (value !== "active" && value !== "disabled") {
    throw new Error("'status' must be exactly 'active' or 'disabled'");
  }
  return value;
}

/**
 * Reads the optional patch members of `forms_update_definition`.
 *
 * An empty patch is refused rather than accepted as a no-op. `updateFormDefinition` would happily
 * re-save the unchanged record, and the tool would report success for a call that changed nothing —
 * which teaches the model its call worked. The human PUT route can tolerate that; a tool must not.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function requireFormsPatch(input: Record<string, unknown>): { name?: string; fields?: FieldDescriptor[]; notify?: NotifyConfig } {
  const patch: { name?: string; fields?: FieldDescriptor[]; notify?: NotifyConfig } = {};
  if (typeof input.name === "string") patch.name = input.name;
  if (Array.isArray(input.fields)) patch.fields = input.fields as FieldDescriptor[];
  if (input.notify !== undefined) patch.notify = input.notify as NotifyConfig;
  if (Object.keys(patch).length === 0) {
    throw new Error("at least one of 'name', 'fields', or 'notify' is required — 'slug' is immutable and is never updated");
  }
  return patch;
}

export function buildFormsRegistrations(routeDeps: FormsToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    forms_list_definitions: async (ctx) => {
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "admin.forms.manage",
        entityType: "form_definition",
      });
      const definitions = await routeDeps.formDefinitionRepo.list({ workspaceId: routeDeps.workspaceId });
      return { definitions: definitions.map(toFormDefinitionView) };
    },
    forms_create_definition: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      return withSchemaOnRejection({ toolId: "forms_create_definition", catalog: CATALOG_BY_ID, isShapeRejection: isFormsShapeRejection }, async () => {
        const { definition } = await createFormDefinition({
          deps: formsDeps(routeDeps),
          input: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            name: requireString(input, "name"),
            slug: requireString(input, "slug"),
            fields: Array.isArray(input.fields) ? (input.fields as FieldDescriptor[]) : [],
            notify: input.notify as NotifyConfig | undefined,
          },
        });
        return { definition: toFormDefinitionView(definition) };
      });
    },
    forms_update_definition: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      return withSchemaOnRejection({ toolId: "forms_update_definition", catalog: CATALOG_BY_ID, isShapeRejection: isFormsShapeRejection }, async () => {
        const { definition } = await updateFormDefinition({
          deps: formsDeps(routeDeps),
          input: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            formId: requireString(input, "formId"),
            patch: requireFormsPatch(input),
          },
        });
        return { definition: toFormDefinitionView(definition) };
      });
    },
    forms_set_definition_status: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      return withSchemaOnRejection({ toolId: "forms_set_definition_status", catalog: CATALOG_BY_ID, isShapeRejection: isFormsShapeRejection }, async () => {
        const { definition } = await setFormDefinitionStatus({
          deps: formsDeps(routeDeps),
          input: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            formId: requireString(input, "formId"),
            status: requireFormsStatus(input),
          },
        });
        return { definition: toFormDefinitionView(definition) };
      });
    },

    forms_list_submissions: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const formId = requireString(input, "formId");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "admin.forms.submissions.read",
        entityType: "form_submission",
      });

      const definition = await routeDeps.formDefinitionRepo.findById({ workspaceId: routeDeps.workspaceId, id: formId });
      if (!definition) throw new Error(`form definition '${formId}' was not found`);

      const limit = requireSubmissionsLimit(input);
      const cursor = typeof input.cursor === "string" ? input.cursor : undefined;
      const page = await routeDeps.formSubmissionRepo.listByDefinition({
        workspaceId: routeDeps.workspaceId,
        formDefinitionId: formId,
        limit,
        cursor,
      });
      return { submissions: page.items.map(toFormSubmissionView), nextCursor: page.nextCursor };
    },

    forms_get_submission: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const formId = requireString(input, "formId");
      const submissionId = requireString(input, "submissionId");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "admin.forms.submissions.read",
        entityType: "form_submission",
        entityId: submissionId,
      });

      const submission = await routeDeps.formSubmissionRepo.findById({ workspaceId: routeDeps.workspaceId, id: submissionId });
      if (!submission || submission.formDefinitionId !== formId) {
        throw new Error(`submission '${submissionId}' was not found`);
      }
      return { submission: toFormSubmissionView(submission) };
    },
  };

  // No `unwiredToolIds`: Forms wires its ENTIRE catalog, which makes a new catalog entry added
  // without a handler a build failure rather than a silently missing tool.
  return buildDomainRegistrations({
    domain: "forms",
    catalogModule: "forms/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: formsDerivedRisk,
  });
}

/**
 * Forms' `"form"` implementation of `content_duplicate` — see
 * `assistant/duplicate-resource-registry.ts` for the contract, and
 * `features/post/tool-registrations.ts`'s `duplicatePostOrPage` for the sibling `"post"`/`"page"`
 * one. This is the resource that proves the generic tool's seam is real rather than a post-shaped
 * hole with a `resource` parameter bolted on: it gates on `admin.forms.manage`, NOT the
 * `content.write` post/page use, so a caller permitted to copy a page is not thereby permitted to
 * copy a form.
 *
 * No separate upfront read check, unlike `duplicatePostOrPage`'s `content.read` one: reading a form
 * definition IS `admin.forms.manage` in this domain (`forms_list_definitions` gates on exactly that
 * permission), which `content_duplicate`'s own outer gate has already established before this runs.
 * A second identical check would be the duplicate evaluator ADR-021 §2 forbids.
 *
 * What is copied: `name` (defaulting to `"Copy of <source name>"`), every field descriptor, and the
 * notify config — all deep-copied, so editing the copy can never reach back into the source row.
 * `slug` is derived (see `duplicate-slug.ts` for why Forms needs derivation where Posts does not).
 *
 * @complexity O(f) in the source's field count, plus one repo read per slug candidate tried.
 */
async function duplicateFormDefinition(
  routeDeps: FormsToolDeps,
  input: { principalId: string; id: string; overrides: { title?: string; slug?: string; status?: string } }
): Promise<Record<string, unknown>> {
  // Rejected rather than ignored. `content_duplicate`'s `status` override is spelled in post/page's
  // vocabulary (`draft`/`published`), which a form definition has no equivalent of — its statuses are
  // `active`/`disabled`, flipped by `forms_set_definition_status`. Silently dropping the field would
  // leave a caller believing it had set something.
  if (input.overrides.status !== undefined) {
    throw new ToolInputError(
      "content_duplicate: resource 'form' does not support the 'status' override — a form definition is " +
        "active/disabled, not draft/published. Overrides honored for 'form': title (the copy's name) and " +
        "slug. The copy inherits the source's own active/disabled state; use forms_set_definition_status " +
        "to change it afterwards."
    );
  }

  const source = await routeDeps.formDefinitionRepo.findById({ workspaceId: routeDeps.workspaceId, id: input.id });
  if (!source) throw new FormDefinitionNotFoundError(`form definition '${input.id}' was not found`);

  const name = input.overrides.title ?? `Copy of ${source.name}`;
  const slug =
    input.overrides.slug ??
    (await deriveAvailableFormSlug(
      { name },
      {
        isTaken: async (candidate) =>
          (await routeDeps.formDefinitionRepo.findBySlug({ workspaceId: routeDeps.workspaceId, slug: candidate })) !== null,
      }
    ));

  const actor = { id: input.principalId, kind: AGENT_TOOL_PRINCIPAL_KIND };
  const { definition } = await createFormDefinition({
    deps: formsDeps(routeDeps),
    input: {
      workspaceId: routeDeps.workspaceId,
      actor,
      name,
      slug,
      // Deep-copied, not shared: `fields` and `notify.recipients` are arrays of objects the source
      // row still owns, and a shallow copy would make an edit to the copy's fields mutate the
      // source's — the same class of silent shared-state corruption `duplicate-embeds.ts` exists
      // to prevent on the post side.
      fields: source.fields.map((field) => ({ ...field })),
      notify: { enabled: source.notify.enabled, recipients: [...source.notify.recipients] },
    },
  });

  // `createFormDefinition` always creates `active`. A copy of a DISABLED form must not come back
  // live — the same "a copy is never more exposed than its source" rule that makes a duplicated
  // published page default to draft. Two commands rather than one because `createFormDefinition`
  // takes no status; a failure here surfaces to the caller rather than silently leaving an active
  // copy, and the copy is a fresh row nothing references yet, so the window is inert.
  if (source.status === "disabled") {
    const { definition: disabled } = await setFormDefinitionStatus({
      deps: formsDeps(routeDeps),
      input: { workspaceId: routeDeps.workspaceId, actor, formId: definition.id, status: "disabled" },
    });
    return { definition: toFormDefinitionView(disabled) };
  }

  return { definition: toFormDefinitionView(definition) };
}

/**
 * `content_duplicate`'s resource contributor for `"form"`, resolving to `admin.forms.manage` — the
 * SAME permission this domain's own `forms_create_definition`/`forms_update_definition` already
 * declare. No new permission is invented for the generic tool.
 *
 * Called from the composition root (`server/runtime/composition/tool-catalog-manifest.ts`), never
 * from within this domain: `.dependency-cruiser.mjs`'s
 * `domain-no-direct-assistant-tool-registration` rule bans any non-type-only `features/** ->
 * assistant/**` import, so this function returns plain data and imports only the registry's TYPE.
 */
export function contributeFormsDuplicateHandlers(): DuplicateResourceHandlerContributor[] {
  return [
    {
      resource: "form",
      build: (routeDeps) => ({
        permission: "admin.forms.manage",
        duplicate: (input) => duplicateFormDefinition(routeDeps, input),
      }),
    },
  ];
}

/**
 * Contributes Forms' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildFormsRegistrations`/
 * `formsDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 batch 2). Like
 * `content-types`, this converts AFTER `widgets` (this batch's first conversion) specifically because
 * `widgets/resolvers/{contact-form,create-core-resolvers}.ts` import `forms` internally — with
 * `widgets` off the static `DOMAIN_SLICES` array first, `assistant -> widgets -> forms -> assistant`
 * cannot close.
 */
export function contributeFormsTools(): ToolContributor {
  return { domain: "forms", build: buildFormsRegistrations, risk: formsDerivedRisk };
}
