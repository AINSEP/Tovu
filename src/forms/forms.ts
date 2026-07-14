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

const MIN_FIELDS = 1;
const MAX_FIELDS = 20;
const MIN_LABEL_LENGTH = 1;
const MAX_LABEL_LENGTH = 200;
const MIN_MAX_LENGTH = 1;
const MAX_MAX_LENGTH = 5000;
const FIELD_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const FIELD_TYPES = new Set(["text", "email", "textarea", "checkbox"]);

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
