import type { FieldDescriptor, FormDefinitionRecord } from "./types";

/**
 * @file Pure validation core for `forms` (SPEC-010, ADR-PIPE-010 C-002/C-003/C-004).
 *
 * Purpose:
 * `validateFieldDescriptors`, `validateSubmissionPayload`, `isHoneypotTripped` — the "one
 * evaluator" for validation logic (mirrors `features/settings/settings.ts`'s
 * `validateDefinitionInput` shape). Zero I/O; every export here is a pure, total function that
 * returns a discriminated result rather than throwing, so both `write-service.ts` and
 * `submit-service.ts` decide how to surface a failure (typed errors, `errors.ts`).
 *
 * Deliberately does NOT import `./manifest` — see `types.ts`'s file header for why domain code
 * never reads the manifest back (ADR-PIPE-010 Decision/Enforcement).
 */

// Exported so `agent-tools.ts`'s published JSON Schemas are built FROM the same values this file
// enforces rather than restating them. Enforcement stays here and only here.
const MIN_FIELDS = 1;
export const MAX_FIELDS = 20;
const MIN_LABEL_LENGTH = 1;
export const MAX_LABEL_LENGTH = 200;
export const MIN_MAX_LENGTH = 1;
export const MAX_MAX_LENGTH = 5000;
export const FIELD_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
export const FIELD_TYPES = new Set(["text", "email", "textarea", "checkbox"]);

// className/attributes (per-field CSS classes + HTML attributes, admin UI "field attributes"
// modal). Exported for the same reason as the constants above — `agent-tools.ts`'s published JSON
// Schemas are built FROM these values, and `server/http/site/render.ts`'s public render path
// re-checks `ATTRIBUTE_NAME_PATTERN` defensively rather than trusting that every stored field went
// through this gate.
export const MAX_CLASS_NAME_LENGTH = 300;
export const MAX_ATTRIBUTES_PER_FIELD = 12;
export const MAX_ATTRIBUTE_VALUE_LENGTH = 300;
/**
 * Attribute-NAME allowlist (deny by default). An attribute value is inert once escaped
 * (`escapeHtml` handles `"`), but an attribute NAME is structurally dangerous — `onclick` is not
 * escapable — so this is the only gate for names, not a fast-reject in front of a real sanitizer.
 * `aria-*`/`data-*` are open namespaces; everything else is a fixed, closed list. In particular this
 * rejects anything matching `^on`, plus `style`/`formaction`/`href`/`src`/`srcdoc` (script/markup
 * injection surfaces) and `id`/`name`/`type` (the renderer already sets all three on the same
 * element — `id` for the `<label for>` association, `name` for the submitted field key
 * `validateSubmissionPayload` keys off of, `type` for the field's own declared vocabulary — so an
 * attribute-authored override of any of them would either break that wiring or silently duplicate
 * it, never usefully change it).
 */
export const ATTRIBUTE_NAME_PATTERN =
  /^(aria-[a-z0-9-]+|data-[a-z0-9-]+|placeholder|autocomplete|inputmode|pattern|title|min|max|step|minlength|spellcheck|readonly)$/;

/** Reserved honeypot key (REQ-08) — always accepted on a submission, never a declared field id. */
export const HONEYPOT_KEY = "_hp";

export interface FieldError {
  field: string;
  reason: string;
}

export type FieldValidationResult = { valid: true } | { valid: false; fieldErrors: FieldError[] };

/**
 * C-002/REQ-02/INV-02 — validates a candidate `fields[]` array: closed vocabulary, 1-20 fields,
 * label 1-200 chars, `maxLength` 1-5000 and forbidden for `checkbox` (behavior.spec.md §4/§7),
 * unique field ids matching `^[a-z][a-z0-9_]*$`.
 *
 * @complexity O(n) over fields.
 * @overallScore 100
 */
export function validateFieldDescriptors(fields: FieldDescriptor[]): FieldValidationResult {
  const fieldErrors: FieldError[] = [];

  if (fields.length < MIN_FIELDS) {
    fieldErrors.push({ field: "fields", reason: `at least ${MIN_FIELDS} field is required` });
  }
  if (fields.length > MAX_FIELDS) {
    fieldErrors.push({ field: "fields", reason: `at most ${MAX_FIELDS} fields are allowed` });
  }

  const seenIds = new Set<string>();
  for (const descriptor of fields) {
    const label = descriptor.id || "(unknown)";

    if (!descriptor.id || !FIELD_ID_PATTERN.test(descriptor.id)) {
      fieldErrors.push({ field: label, reason: "id must match ^[a-z][a-z0-9_]*$" });
    } else if (seenIds.has(descriptor.id)) {
      fieldErrors.push({ field: descriptor.id, reason: "duplicate field id" });
    } else {
      seenIds.add(descriptor.id);
    }

    if (!FIELD_TYPES.has(descriptor.type)) {
      fieldErrors.push({ field: label, reason: `type '${descriptor.type}' is not in the registered vocabulary` });
    }

    if (descriptor.label.length < MIN_LABEL_LENGTH || descriptor.label.length > MAX_LABEL_LENGTH) {
      fieldErrors.push({ field: label, reason: `label must be ${MIN_LABEL_LENGTH}-${MAX_LABEL_LENGTH} characters` });
    }

    if (descriptor.maxLength != null) {
      if (descriptor.type === "checkbox") {
        fieldErrors.push({ field: label, reason: "maxLength is forbidden for checkbox fields" });
      } else if (descriptor.maxLength < MIN_MAX_LENGTH || descriptor.maxLength > MAX_MAX_LENGTH) {
        fieldErrors.push({
          field: label,
          reason: `maxLength must be ${MIN_MAX_LENGTH}-${MAX_MAX_LENGTH}`,
        });
      }
    }

    if (descriptor.className != null) {
      if (typeof descriptor.className !== "string") {
        fieldErrors.push({ field: label, reason: "className must be a string" });
      } else if (descriptor.className.length > MAX_CLASS_NAME_LENGTH) {
        fieldErrors.push({ field: label, reason: `className must be at most ${MAX_CLASS_NAME_LENGTH} characters` });
      }
    }

    if (descriptor.attributes != null) {
      const entries = Object.entries(descriptor.attributes);
      if (entries.length > MAX_ATTRIBUTES_PER_FIELD) {
        fieldErrors.push({ field: label, reason: `at most ${MAX_ATTRIBUTES_PER_FIELD} attributes are allowed` });
      }
      for (const [attrName, attrValue] of entries) {
        if (!ATTRIBUTE_NAME_PATTERN.test(attrName)) {
          fieldErrors.push({ field: label, reason: `attribute '${attrName}' is not allowed` });
          continue;
        }
        if (typeof attrValue !== "string") {
          fieldErrors.push({ field: label, reason: `attribute '${attrName}' value must be a string` });
        } else if (attrValue.length > MAX_ATTRIBUTE_VALUE_LENGTH) {
          fieldErrors.push({
            field: label,
            reason: `attribute '${attrName}' value must be at most ${MAX_ATTRIBUTE_VALUE_LENGTH} characters`,
          });
        }
      }
    }
  }

  if (fieldErrors.length > 0) return { valid: false, fieldErrors };
  return { valid: true };
}

export interface ValidateSubmissionPayloadInput {
  definition: FormDefinitionRecord;
  body: Record<string, unknown>;
}

export type SubmissionValidationResult =
  | { valid: true; data: Record<string, string | boolean> }
  | { valid: false; fieldErrors: FieldError[] };

/**
 * C-003/REQ-06/INV-01 — validates a raw submission body against a definition's declared fields:
 * required fields present, `maxLength` respected, no keys outside the declared fields plus the
 * reserved `_hp` honeypot key (EC-01/EC-02). The sole gate guaranteeing `data`'s keys are always a
 * subset of the definition's field ids (INV-01).
 *
 * @complexity O(n) over declared fields + body keys.
 * @overallScore 100
 */
export function validateSubmissionPayload(input: ValidateSubmissionPayloadInput): SubmissionValidationResult {
  const { definition, body } = input;
  const fieldErrors: FieldError[] = [];
  const fieldsById = new Map(definition.fields.map((f) => [f.id, f]));

  for (const key of Object.keys(body)) {
    if (key === HONEYPOT_KEY) continue;
    if (!fieldsById.has(key)) {
      fieldErrors.push({ field: key, reason: "unregistered_key" });
    }
  }

  const data: Record<string, string | boolean> = {};
  for (const field of definition.fields) {
    const value = body[field.id];

    if (value === undefined || value === null) {
      if (field.required) {
        fieldErrors.push({ field: field.id, reason: "required" });
      }
      continue;
    }

    if (field.type === "checkbox") {
      if (typeof value !== "boolean") {
        fieldErrors.push({ field: field.id, reason: "must be a boolean" });
        continue;
      }
      data[field.id] = value;
      continue;
    }

    if (typeof value !== "string") {
      fieldErrors.push({ field: field.id, reason: "must be a string" });
      continue;
    }
    if (field.required && value.trim() === "") {
      fieldErrors.push({ field: field.id, reason: "required" });
      continue;
    }
    if (field.maxLength != null && value.length > field.maxLength) {
      fieldErrors.push({ field: field.id, reason: "too_long" });
      continue;
    }
    data[field.id] = value;
  }

  if (fieldErrors.length > 0) return { valid: false, fieldErrors };
  return { valid: true, data };
}

/**
 * C-004/REQ-08/INV-04 — present-and-non-empty-after-trim = tripped; absent or whitespace-only =
 * not tripped (EC-09, behavior.spec.md §5.1). Total function, never throws.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function isHoneypotTripped(input: { hp: unknown }): boolean {
  if (typeof input.hp !== "string") return false;
  return input.hp.trim().length > 0;
}
