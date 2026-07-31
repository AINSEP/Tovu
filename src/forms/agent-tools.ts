/**
 * @file The Forms agent-tool catalog (SPEC-010, ADR-PIPE-010), instantiating SPEC-016 REQ-22's
 * naming/callability convention for this domain — the same shape
 * `features/content-types/agent-tools.ts` uses, including its `inputSchema` contract.
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes and the
 * permission each carries. Every entry maps 1:1 onto a real exported function of
 * `forms/write-service.ts` — this catalog never names an operation the domain cannot perform.
 *
 * Deliberate absences (the point of a catalog, not an oversight):
 * - There is NO `forms_delete_definition`, and no description here may imply one. INV-08 says a
 *   form definition is never permanently deleted, only flipped `active` ⇄ `disabled`, and
 *   `FormDefinitionRepoPort` enforces that structurally by exposing no `delete` method at all.
 *   "Delete this form" must therefore route an agent to `forms_set_definition_status` — never to a
 *   lever that does not exist. This mirrors `features/recovery/agent-tools.ts`'s identical
 *   discipline around `backup_confirm_restore`.
 * - Submissions carry a separate permission tier (`admin.forms.submissions.*`) that does not go
 *   through `write-service.ts` — `routes/admin/forms/{list,get,delete}-submissions.ts` gate
 *   directly, the same split `comments/agent-tools.ts` makes for its read tools. Read access
 *   (`forms_list_submissions`/`forms_get_submission`) IS wired below: a `FormSubmissionRecord` is
 *   `{id, formDefinitionId, data, sourceIp, submittedAt}` (`types.ts`) — the same visitor-typed
 *   field values plus one raw request IP the human admin submissions screen already displays, no
 *   payment or credential material of any kind, so listing/reading what a human operator can
 *   already see through the same permission is not a new exposure. There is deliberately NO
 *   `forms_delete_submission`: unlike a form definition (which only ever gets soft-retired) a
 *   submission's delete is genuinely irreversible and, unlike `identity_role_delete`/
 *   `identity_policy_delete`, carries no "still referenced, so refuse" guard at all — nothing stops
 *   a single call from permanently destroying a visitor's data with no way back. That asymmetry
 *   (reversible read vs. unconditional permanent write) is exactly the read/write split this pass's
 *   directive asks for; delete stays human-UI-only.
 *
 * How it relates to the project:
 * `assistant/tool-registrations.ts` maps these entries into `@jini-ai/core` `ToolRegistration`s;
 * the ADR-014 tool filter consumes the catalog to decide which names a session may see. Actual
 * enforcement is `executeCommand`'s ADR-021 `authorize()` inside each write-service function —
 * this module declares shape only and performs no I/O.
 *
 * Architectural role:
 * `forms` domain declaration. Imports only the constants its own domain already enforces, so the
 * published JSON Schemas cannot drift from the validators. Deliberately does NOT import
 * `./manifest` (ADR-PIPE-010 Enforcement: the manifest is read BY activation code, never BY domain
 * code) — the field-type list is taken from `./forms`, which is where it is actually enforced.
 */

import { FIELD_ID_PATTERN, FIELD_TYPES, MAX_FIELDS, MAX_LABEL_LENGTH, MAX_MAX_LENGTH, MIN_MAX_LENGTH } from "./forms";
import { MAX_NAME_LENGTH, MAX_NOTIFY_RECIPIENTS, SLUG_PATTERN } from "./write-service";

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export type AgentToolActorClassRule = "confirmer-must-equal-own-delegatedBy" | "user-only" | "none";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  actorClassRule?: AgentToolActorClassRule;
  /**
   * JSON Schema for this tool's `input`, published to the model via `ToolDescriptor.inputSchema`
   * (`assistant/tool-registrations.ts`, which refuses to wire any tool lacking one). Structurally
   * identical to the content-types catalog's field of the same name.
   */
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** One entry of a `fields` array, as published to the model. Mirrors what `forms.ts`'s `validateFieldDescriptors` enforces. */
const FIELD_DESCRIPTOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "type", "required"],
  properties: {
    id: {
      type: "string",
      pattern: FIELD_ID_PATTERN.source,
      description: "Stable field id. Lowercase letters, digits and underscores; must start with a letter. Ids are permanent — an existing id can never be removed by an update.",
    },
    label: { type: "string", minLength: 1, maxLength: MAX_LABEL_LENGTH, description: "Human-readable label shown above the input." },
    type: {
      type: "string",
      enum: [...FIELD_TYPES],
      description: "One of the four supported field types. No other value is accepted.",
    },
    required: { type: "boolean", description: "Whether the visitor must fill this field in. Must be a real boolean, not a string." },
    maxLength: {
      type: ["integer", "null"],
      minimum: MIN_MAX_LENGTH,
      maximum: MAX_MAX_LENGTH,
      description: `Optional per-field character cap (${MIN_MAX_LENGTH}-${MAX_MAX_LENGTH}). Forbidden for 'checkbox' fields — supplying it there is rejected.`,
    },
  },
} as const;

/** The `fields` property shared by create and update. */
const FIELDS_SCHEMA = {
  type: "array",
  minItems: 1,
  maxItems: MAX_FIELDS,
  items: FIELD_DESCRIPTOR_SCHEMA,
  description: `The COMPLETE field list (1-${MAX_FIELDS} fields). Both tools that accept it replace the whole list, so it must include every field the form keeps — but note that unlike a content type, an EXISTING field id may never be dropped; omitting one is rejected rather than deleting it.`,
} as const;

/** The `notify` property shared by create and update. */
const NOTIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["enabled", "recipients"],
  properties: {
    enabled: { type: "boolean", description: "Whether to email recipients on each submission." },
    recipients: {
      type: "array",
      maxItems: MAX_NOTIFY_RECIPIENTS,
      items: { type: "string", description: "A valid email address." },
      description: `Up to ${MAX_NOTIFY_RECIPIENTS} email addresses. Each must be a valid address or the whole call is rejected.`,
    },
  },
} as const;

const FORM_ID_SCHEMA = {
  type: "string",
  description: "The form definition's id, as returned by a create call. This is the opaque id, NOT the slug.",
} as const;

/**
 * Submission pagination bounds — mirrors `routes/admin/forms/list-submissions.ts`'s own
 * `MIN_LIMIT`/`MAX_LIMIT` literals (not exported from there, since a domain catalog does not import
 * a route file; kept in sync by hand, the same disclosed duplication `types.ts`'s own header
 * already accepts for `FieldType` vs. `manifest.ts`).
 */
const SUBMISSIONS_MIN_LIMIT = 1;
const SUBMISSIONS_MAX_LIMIT = 100;

const SUBMISSION_ID_SCHEMA = {
  type: "string",
  description: "The submission's id, as returned by forms_list_submissions.",
} as const;

/** `forms_list_definitions`'s input — it takes no arguments at all, matching how
 * `identity_user_list`/`identity_role_list`/`menus_list_menus` are this codebase's convention for a
 * small, bounded catalog: one unfiltered list IS the domain's "search", not a separate capability. */
const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

/**
 * Forms' fixed agent-tool catalog: the three `write-service.ts` operations plus the two read-only
 * submission tools.
 *
 * The three definition tools are gated on `admin.forms.manage`, which is what each `executeCommand`
 * call in `write-service.ts` actually passes to `authorize()`. Forms declares no separate read
 * capability for definitions (`manifest.ts`'s `FORMS_CAPABILITIES` has three strings, and the human
 * `list.ts`/`get-by-id.ts` routes already authorize reads against `admin.forms.manage`), so nothing
 * here invents an `admin.forms.read` that no policy would ever grant.
 *
 * The two submission tools are gated on the SEPARATE `admin.forms.submissions.read` permission —
 * exactly what `routes/admin/forms/{list,get}-submissions.ts` check, since submissions are visitor
 * data with their own permission tier, not form-configuration state.
 */
export const formsAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "forms_list_definitions",
    description:
      "Lists every form definition in the workspace with its id, name, slug, status, and field count. Read-only. Call this to find a form's opaque id from its name or slug before calling forms_update_definition, forms_set_definition_status, forms_list_submissions, or forms_get_submission — those tools take formId, not slug.",
    sideEffects: "none",
    authorization: { permission: "admin.forms.manage" },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "forms_create_definition",
    description:
      "Creates a new form definition from a name, a URL slug, and a complete list of field descriptors. The slug must be unique within the workspace and can never be changed afterwards.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.forms.manage" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["name", "slug", "fields"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH, description: "Human-readable form name shown in the admin UI." },
        slug: {
          type: "string",
          pattern: SLUG_PATTERN.source,
          description: "Permanent URL slug. Lowercase letters, digits and hyphens; must start with a letter or digit; max 64 characters. Cannot be changed later, and must not already exist in this workspace.",
        },
        fields: FIELDS_SCHEMA,
        notify: NOTIFY_SCHEMA,
      },
    },
  },
  {
    name: "forms_update_definition",
    description:
      "Updates an existing form definition's name, field list, or notification recipients. The slug is immutable and is ignored if supplied. Existing field ids cannot be dropped — omitting one is rejected, not treated as a deletion.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.forms.manage" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["formId"],
      properties: {
        formId: FORM_ID_SCHEMA,
        name: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH, description: "New form name. Omit to leave unchanged." },
        fields: FIELDS_SCHEMA,
        notify: NOTIFY_SCHEMA,
      },
    },
  },
  {
    name: "forms_set_definition_status",
    description:
      "Sets a form definition's status to 'active' or 'disabled'. Disabling is how a form is taken out of service and is the ONLY way to retire one — a form definition is never permanently deleted, and no tool can delete one.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.forms.manage" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["formId", "status"],
      properties: {
        formId: FORM_ID_SCHEMA,
        status: {
          type: "string",
          enum: ["active", "disabled"],
          description: "'disabled' takes the form out of service (its stored submissions are retained); 'active' puts it back.",
        },
      },
    },
  },
  {
    name: "forms_list_submissions",
    description:
      "Lists a form's submissions, newest-first, with each submission's field values, source IP, and submission time. Read-only. There is no forms_delete_submission — permanently removing a visitor's data stays human-UI-only.",
    sideEffects: "none",
    authorization: { permission: "admin.forms.submissions.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["formId"],
      properties: {
        formId: FORM_ID_SCHEMA,
        limit: {
          type: "integer",
          minimum: SUBMISSIONS_MIN_LIMIT,
          maximum: SUBMISSIONS_MAX_LIMIT,
          description: `Page size, ${SUBMISSIONS_MIN_LIMIT}-${SUBMISSIONS_MAX_LIMIT}. Defaults to 50 if omitted.`,
        },
        cursor: { type: "string", description: "Opaque pagination cursor from a previous call's nextCursor. Omit for the first page." },
      },
    },
  },
  {
    name: "forms_get_submission",
    description: "Reads one submission's full field values, source IP, and submission time by id. Read-only.",
    sideEffects: "none",
    authorization: { permission: "admin.forms.submissions.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["formId", "submissionId"],
      properties: { formId: FORM_ID_SCHEMA, submissionId: SUBMISSION_ID_SCHEMA },
    },
  },
];
