/**
 * @file Forms' half of ADR-049 Decision 4 (SPEC-010): maps `agent-tools.ts`'s three catalog entries
 * onto the three operations `write-service.ts` exports, as `ToolRegistration`s.
 *
 * `ToolPolicy.authorize` is a pass-through for all three (see `buildDomainRegistrations`), because
 * ADR-021 §2 is "one evaluator": `admin.forms.manage` is enforced one layer down by `executeCommand`
 * inside every one of the three write-service functions, against the SAME `authorize()` the human
 * admin routes use. A second check here would be a duplicate evaluator, and a `ToolPolicy`-only
 * check would be bypassable by any future non-tool caller of the same domain function.
 */
import {
  AGENT_TOOL_PRINCIPAL_KIND,
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireString,
  withSchemaOnRejection,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "../assistant/tool-registration-kit";
import type { RouteDeps } from "../server/routes/types";
import { formsAgentToolCatalog } from "./agent-tools";
import { FormFieldValidationError } from "./errors";
import type { FieldDescriptor, FormDefinitionRecord, FormDefinitionStatus, NotifyConfig } from "./types";
import { createFormDefinition, setFormDefinitionStatus, updateFormDefinition } from "./write-service";

const CATALOG_BY_ID = indexCatalogById(formsAgentToolCatalog);

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const formsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> createFormDefinition (write-service.ts): executeCommand -> repo.create + change-set + outbox.
  ["forms_create_definition", "mutates-durable-state"],
  // -> updateFormDefinition (write-service.ts): executeCommand -> repo.update + change-set + outbox.
  ["forms_update_definition", "mutates-durable-state"],
  // -> setFormDefinitionStatus (write-service.ts): executeCommand -> repo.update (status flip) +
  //    change-set + outbox. Never a delete: FormDefinitionRepoPort exposes no delete method (INV-08).
  ["forms_set_definition_status", "mutates-durable-state"],
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

function formsDeps(routeDeps: RouteDeps) {
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

export function buildFormsRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
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
  };

  // No `unwiredToolIds`: Forms wires its ENTIRE catalog, which makes a 4th catalog entry added
  // without a handler a build failure rather than a silently missing tool.
  return buildDomainRegistrations({
    domain: "forms",
    catalogModule: "forms/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: formsDerivedRisk,
  });
}
