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
import type { AuthorizeFn, ChangeSetRepoPort } from "../core/commands";
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
import { registerToolContributor } from "#src/assistant/index";
import { formsAgentToolCatalog } from "./agent-tools";
import { FormFieldValidationError } from "./errors";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "./ports";
import type {
  FieldDescriptor,
  FormDefinitionRecord,
  FormDefinitionStatus,
  FormSubmissionRecord,
  NotifyConfig,
} from "./types";
import {
  createFormDefinition,
  setFormDefinitionStatus,
  updateFormDefinition,
} from "./write-service";

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
 * Contributes Forms' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildFormsRegistrations`/
 * `formsDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 batch 2). Like
 * `content-types`, this converts AFTER `widgets` (this batch's first conversion) specifically because
 * `widgets/resolvers/{contact-form,create-core-resolvers}.ts` import `forms` internally — with
 * `widgets` off the static `DOMAIN_SLICES` array first, `assistant -> widgets -> forms -> assistant`
 * cannot close.
 */
export function contributeFormsTools(): void {
  registerToolContributor({ domain: "forms", build: buildFormsRegistrations, risk: formsDerivedRisk });
}
