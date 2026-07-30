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
 * - Submission tools (read/delete of visitor-supplied `form_submissions` PII) are deliberately out
 *   of scope: a separate permission tier (`admin.forms.submissions.*`) that does not go through
 *   `write-service.ts`. Adding them is a separate, deliberate decision.
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
 * Forms' fixed agent-tool catalog — exactly the three operations `write-service.ts` exports.
 *
 * All three are gated on `admin.forms.manage`, which is what each `executeCommand` call in
 * `write-service.ts` actually passes to `authorize()`. Forms declares no separate read capability
 * for definitions (`manifest.ts`'s `FORMS_CAPABILITIES` has three strings, and the human
 * `list.ts`/`get-by-id.ts` routes already authorize reads against `admin.forms.manage`), so
 * nothing here invents an `admin.forms.read` that no policy would ever grant.
 */
export const formsAgentToolCatalog: AgentToolDefinition[] = [
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
];
