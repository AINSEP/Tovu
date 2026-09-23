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
import {
  forbiddenRule,
  withModelFacingErrors,
  type ModelFacingErrorRule,
} from "#src/contracts/core/model-facing-tool-errors";
import { formsAgentToolCatalog } from "./agent-tools.js";
import { deriveAvailableFormSlug } from "./duplicate-slug.js";
import { deriveDuplicateName } from "../content-duplication/derive-available-name.js";
import {
  FormDefinitionNotFoundError,
  FormFieldValidationError,
  FormRateLimitExceededError,
  FormSlugConflictError,
  FormSubmissionNotFoundError,
  FormSubmissionValidationError,
} from "./errors.js";
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
  //    change-set + outbox. Never a delete: FormDefinitionRepoPort exposes no delete method — a
  //    definition is removed permanently only via a Trash purge, never through this tool (INV-08).
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

/** Reads and range-checks `limit`, mirroring `routes/admin/forms/list-submissions.ts`'s own check.
 *  `forms_list_submissions` has no `withSchemaOnRejection` wrap (unlike the three definition tools
 *  below), so this throws `ToolInputError` directly rather than a domain error class a predicate
 *  would need to recognize — same shape every other unwrapped ad-hoc validator in this codebase
 *  uses (e.g. `features/taxonomy/tool-registrations.ts`'s `termIds` check). */
function requireSubmissionsLimit(input: Record<string, unknown>): number {
  if (input.limit === undefined) return SUBMISSIONS_DEFAULT_LIMIT;
  const limit = input.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < SUBMISSIONS_MIN_LIMIT || limit > SUBMISSIONS_MAX_LIMIT) {
    throw new ToolInputError(`'limit' must be an integer between ${SUBMISSIONS_MIN_LIMIT} and ${SUBMISSIONS_MAX_LIMIT}`);
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

/**
 * `forms_set_definition_status` is wrapped in `withSchemaOnRejection`/`isFormsShapeRejection`, and
 * that predicate only recognizes `FormFieldValidationError` — a bare `Error` thrown here would never
 * match it and would reach `@jini-ai/daemon`'s `ToolExecutor` as `errorKind: 'internal'`, redacted to
 * a message-stripped 500 by `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` (SEC-005). Throwing the
 * SAME domain error class the predicate already recognizes (rather than broadening the predicate to
 * also accept a generic `ToolInputError`) is the convention every sibling domain's own
 * `isShapeRejection` follows — `theme`/`sites`/`site-inspection`'s predicates each stay a fixed,
 * narrow allowlist of domain-specific classes, and a new ad-hoc check adopts one of those (existing
 * or freshly declared) rather than widening the allowlist to a generic marker.
 */
function requireFormsStatus(input: Record<string, unknown>): FormDefinitionStatus {
  const value = input.status;
  if (value !== "active" && value !== "disabled") {
    throw new FormFieldValidationError("'status' must be exactly 'active' or 'disabled'");
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
 * `forms_update_definition` is wrapped in `withSchemaOnRejection`/`isFormsShapeRejection` the same
 * way `forms_set_definition_status` is — see {@link requireFormsStatus}'s doc for why this throws
 * `FormFieldValidationError` rather than a bare `Error` or a generic `ToolInputError`.
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
    throw new FormFieldValidationError("at least one of 'name', 'fields', or 'notify' is required — 'slug' is immutable and is never updated");
  }
  return patch;
}

/**
 * The Forms errors that reach the model with their real reason instead of a redacted
 * `INTERNAL_ERROR` — see `contracts/core/model-facing-tool-errors.ts` for the mechanism and for why
 * this list is an ALLOWLIST rather than a blanket unwrap.
 *
 * Codes are `errors.ts`'s own documented per-class codes verbatim (`FORMS_SLUG_CONFLICT`,
 * `FORMS_DEFINITION_NOT_FOUND`, ...), the same discipline `features/widgets/tool-registrations.ts`
 * follows, so the model-facing token matches what that class already claims to be.
 *
 * `FormFieldValidationError` is deliberately ABSENT, and its absence is load-bearing rather than an
 * oversight: `isFormsShapeRejection`/`withSchemaOnRejection` already converts it into a
 * schema-decorated `ToolInputError`, which `reclassifyToolError` passes through untouched. Listing
 * it here would prepend a second code onto a message that has already been shaped for the model.
 * `tool-registrations.model-facing-errors.test.ts`'s last case pins that non-interference directly.
 *
 * On PII: a form SUBMISSION carries whatever a visitor typed, but no error class here interpolates
 * submission content — `FormSubmissionNotFoundError` names the id the caller itself supplied, and
 * nothing else. `FormSubmissionValidationError` is listed for the public-submit path's benefit even
 * though no tool in this catalog currently reaches it; its `fieldErrors` detail rides on the
 * property, not in the `message` this surfaces.
 */
const FORMS_MODEL_FACING_ERRORS: readonly ModelFacingErrorRule[] = [
  forbiddenRule("FORMS"),
  { error: FormDefinitionNotFoundError, code: "FORMS_DEFINITION_NOT_FOUND" },
  { error: FormSubmissionNotFoundError, code: "FORMS_SUBMISSION_NOT_FOUND" },
  { error: FormSlugConflictError, code: "FORMS_SLUG_CONFLICT" },
  { error: FormSubmissionValidationError, code: "FORMS_SUBMISSION_VALIDATION_ERROR" },
  { error: FormRateLimitExceededError, code: "FORMS_RATE_LIMIT_EXCEEDED" },
];

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
      // The domain's own typed class, not a bare `Error`: `errors.ts` already declares it with the
      // `FORMS_DEFINITION_NOT_FOUND` code this reaches the model under, and a bare `Error` could
      // never be matched by any allowlist without opening one that matches everything.
      if (!definition) throw new FormDefinitionNotFoundError(`form definition '${formId}' was not found`);

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
        // Same reasoning as `forms_list_submissions` above. Note this arm deliberately answers
        // "not found" for a submission that EXISTS under a different definition — the cross-form
        // probe is refused with the same text as a genuine miss, and surfacing the real reason
        // does not change that: the message names only the id the caller already supplied.
        throw new FormSubmissionNotFoundError(`submission '${submissionId}' was not found`);
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
    // The whole map at once, so no handler can be the one that forgot — see
    // `withModelFacingErrors`' own doc for why a per-call-site reshape is the defect this avoids.
    // Composes with the three handlers' inner `withSchemaOnRejection` rather than competing with
    // it: a shape rejection is already a `ToolInputError` by the time it reaches here, and
    // `reclassifyToolError` returns those untouched.
    handlers: withModelFacingErrors(handlers, FORMS_MODEL_FACING_ERRORS),
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
 * What is copied: `name` (defaulting to the source's own name with a numeric suffix — see
 * `../content-duplication/derive-available-name.ts`'s header for the owner's ruling — never
 * `"Copy of <source name>"`), every field descriptor, and the notify config — all deep-copied, so
 * editing the copy can never reach back into the source row. `slug` is derived FROM that (possibly
 * numbered) name (see `duplicate-slug.ts` for why Forms needs derivation where Posts does not), so
 * `"Contact Us 2"` yields `"contact-us-2"` and the two stay in step.
 *
 * @complexity O(f) in the source's field count, plus one `formDefinitionRepo.list()` scan for the
 * default name (skipped entirely when the caller supplies an explicit `overrides.title` — see
 * {@link deriveDefaultDuplicateFormName}) plus one repo read per slug candidate tried.
 */
/**
 * Derives `content_duplicate`'s default name for a form copy — see
 * `../content-duplication/derive-available-name.ts`'s header for the owner's numeric-suffix ruling.
 * Only ever called when the caller supplied no explicit `overrides.title`.
 *
 * @complexity One `formDefinitionRepo.list()` scan (3 forms at current scale, read live 2026-09-08 —
 * see the shared module's own header for why this is an accepted O(n) scan rather than a new port
 * method), then `deriveDuplicateName`'s own bounded search.
 */
async function deriveDefaultDuplicateFormName(routeDeps: FormsToolDeps, source: FormDefinitionRecord): Promise<string> {
  const existingNames = new Set(
    (await routeDeps.formDefinitionRepo.list({ workspaceId: routeDeps.workspaceId })).map((form) => form.name)
  );
  return deriveDuplicateName(
    { sourceName: source.name },
    { isTaken: async (candidate) => existingNames.has(candidate) }
  );
}

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

  const name = input.overrides.title ?? (await deriveDefaultDuplicateFormName(routeDeps, source));
  const slug =
    input.overrides.slug ??
    (await deriveAvailableFormSlug(
      { name },
      {
        // `isSlugTaken`, not `findBySlug` — trash-blind, so a trashed form's slug is correctly
        // reported as taken instead of offered to the copy and then colliding on the DB unique
        // index (decision 3, ADS-memory/reports/2026-09-21-t8f-trash-forms-plan.md §B).
        isTaken: async (candidate) =>
          routeDeps.formDefinitionRepo.isSlugTaken({ workspaceId: routeDeps.workspaceId, slug: candidate }),
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
