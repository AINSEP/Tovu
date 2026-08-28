import type { FieldDescriptor, FormDefinitionRecord } from "./types.js";

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
 * One rule per helper below. `validateFieldDescriptors` is a COLLECTOR, not a fail-fast guard —
 * it reports every problem with every descriptor in one pass — so each helper returns the errors
 * it found rather than throwing, and the caller concatenates them in a fixed order. An empty
 * array means "this rule is satisfied", never "this rule did not run".
 */

/**
 * Field id: shape first, then uniqueness. Claims a well-formed id in `claimedIds` so a later
 * descriptor reusing it is reported as a duplicate.
 *
 * A MALFORMED id is deliberately never claimed — two descriptors sharing one bad id each get
 * their own shape error rather than the second being masked as a duplicate, which would tell the
 * author to rename a field when the real fix is to correct both.
 *
 * @param claimedIds Mutated: gains `descriptor.id` when the id is well-formed and previously unseen.
 * @complexity O(1) amortized.
 */
function fieldIdErrors(descriptor: FieldDescriptor, label: string, claimedIds: Set<string>): FieldError[] {
  if (!descriptor.id || !FIELD_ID_PATTERN.test(descriptor.id)) {
    return [{ field: label, reason: "id must match ^[a-z][a-z0-9_]*$" }];
  }
  if (claimedIds.has(descriptor.id)) {
    return [{ field: descriptor.id, reason: "duplicate field id" }];
  }
  claimedIds.add(descriptor.id);
  return [];
}

/** Field type against the closed vocabulary (REQ-02/AC-03). @complexity O(1). */
function fieldTypeErrors(descriptor: FieldDescriptor, label: string): FieldError[] {
  if (!FIELD_TYPES.has(descriptor.type)) {
    return [{ field: label, reason: `type '${descriptor.type}' is not in the registered vocabulary` }];
  }
  return [];
}

/** Human-facing label length (behavior.spec.md §7). @complexity O(1). */
function labelLengthErrors(descriptor: FieldDescriptor, label: string): FieldError[] {
  if (descriptor.label.length < MIN_LABEL_LENGTH || descriptor.label.length > MAX_LABEL_LENGTH) {
    return [{ field: label, reason: `label must be ${MIN_LABEL_LENGTH}-${MAX_LABEL_LENGTH} characters` }];
  }
  return [];
}

/**
 * `maxLength` bounds, plus the checkbox prohibition (behavior.spec.md §4): a checkbox carries a
 * boolean, so a character cap on it is a definition the renderer could not honor, not a stricter
 * one. The prohibition is checked BEFORE the range, so a checkbox with an out-of-range value is
 * told the real problem rather than being sent to fix a number it should not have set at all.
 *
 * @complexity O(1).
 */
function maxLengthErrors(descriptor: FieldDescriptor, label: string): FieldError[] {
  if (descriptor.maxLength == null) return [];
  if (descriptor.type === "checkbox") {
    return [{ field: label, reason: "maxLength is forbidden for checkbox fields" }];
  }
  if (descriptor.maxLength < MIN_MAX_LENGTH || descriptor.maxLength > MAX_MAX_LENGTH) {
    return [{ field: label, reason: `maxLength must be ${MIN_MAX_LENGTH}-${MAX_MAX_LENGTH}` }];
  }
  return [];
}

/**
 * `className` is bounded but never inspected — a class name is inert once HTML-escaped (see
 * `types.ts`'s own note), so length is the only gate. The `typeof` check is defensive: the
 * declared type says `string`, but this function's real callers hand it a parsed request body.
 *
 * @complexity O(1).
 */
function classNameErrors(descriptor: FieldDescriptor, label: string): FieldError[] {
  const { className } = descriptor;
  if (className == null) return [];
  if (typeof className !== "string") {
    return [{ field: label, reason: "className must be a string" }];
  }
  if (className.length > MAX_CLASS_NAME_LENGTH) {
    return [{ field: label, reason: `className must be at most ${MAX_CLASS_NAME_LENGTH} characters` }];
  }
  return [];
}

/**
 * One attribute. The NAME allowlist is checked first and short-circuits the value checks — a
 * rejected name means the attribute is not being rendered at all, so its value is moot, and
 * reporting both would imply fixing the value could help. See `ATTRIBUTE_NAME_PATTERN`'s header
 * for why names are deny-by-default rather than sanitized.
 *
 * @complexity O(1) — the pattern is a fixed alternation, not a scan of a caller-sized list.
 */
function attributeEntryErrors(label: string, attrName: string, attrValue: unknown): FieldError[] {
  if (!ATTRIBUTE_NAME_PATTERN.test(attrName)) {
    return [{ field: label, reason: `attribute '${attrName}' is not allowed` }];
  }
  if (typeof attrValue !== "string") {
    return [{ field: label, reason: `attribute '${attrName}' value must be a string` }];
  }
  if (attrValue.length > MAX_ATTRIBUTE_VALUE_LENGTH) {
    return [{ field: label, reason: `attribute '${attrName}' value must be at most ${MAX_ATTRIBUTE_VALUE_LENGTH} characters` }];
  }
  return [];
}

/**
 * Every attribute on one descriptor. Exceeding the per-field cap is reported but does NOT stop
 * per-attribute checking — an author over the cap still gets told which of their attributes are
 * disallowed, rather than having to delete some and resubmit to discover the next problem.
 *
 * @complexity O(a) in the descriptor's own attribute count, which the cap error reports but does
 * not truncate; `a` is caller-supplied and bounded only by the request body size.
 */
function attributeErrors(descriptor: FieldDescriptor, label: string): FieldError[] {
  const { attributes } = descriptor;
  if (attributes == null) return [];

  const entries = Object.entries(attributes);
  const errors: FieldError[] = [];
  if (entries.length > MAX_ATTRIBUTES_PER_FIELD) {
    errors.push({ field: label, reason: `at most ${MAX_ATTRIBUTES_PER_FIELD} attributes are allowed` });
  }
  for (const [attrName, attrValue] of entries) {
    errors.push(...attributeEntryErrors(label, attrName, attrValue));
  }
  return errors;
}

/**
 * C-002/REQ-02/INV-02 — validates a candidate `fields[]` array: closed vocabulary, 1-20 fields,
 * label 1-200 chars, `maxLength` 1-5000 and forbidden for `checkbox` (behavior.spec.md §4/§7),
 * unique field ids matching `^[a-z][a-z0-9_]*$`.
 *
 * Reports EVERY violation rather than the first, so an author fixing a definition sees the whole
 * list in one round trip. Arity errors come first, then each descriptor in array order, then each
 * rule below in the order they are concatenated — that ordering is asserted by
 * `forms.field-validation.characterization.test.ts` because callers render it as-is.
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

  const claimedIds = new Set<string>();
  for (const descriptor of fields) {
    const label = descriptor.id || "(unknown)";
    fieldErrors.push(
      ...fieldIdErrors(descriptor, label, claimedIds),
      ...fieldTypeErrors(descriptor, label),
      ...labelLengthErrors(descriptor, label),
      ...maxLengthErrors(descriptor, label),
      ...classNameErrors(descriptor, label),
      ...attributeErrors(descriptor, label),
    );
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
 * What the submission body said about one declared field. Three outcomes, not two: a field can be
 * legitimately ABSENT, which is neither an error nor a value to store — collapsing that into
 * "no error" would write `undefined` into `data` and break INV-01's subset guarantee.
 */
type SubmittedValue =
  | { kind: "absent" }
  | { kind: "rejected"; reason: string }
  | { kind: "accepted"; value: string | boolean };

/** Keys the body carries that the definition never declared. `_hp` is reserved (REQ-08) and
 *  always tolerated, but is not a field, so it never reaches `data`.
 *  @complexity O(k) over body keys. */
function unregisteredKeyErrors(body: Record<string, unknown>, fieldsById: ReadonlyMap<string, FieldDescriptor>): FieldError[] {
  const errors: FieldError[] = [];
  for (const key of Object.keys(body)) {
    if (key === HONEYPOT_KEY) continue;
    if (!fieldsById.has(key)) {
      errors.push({ field: key, reason: "unregistered_key" });
    }
  }
  return errors;
}

/**
 * A present, non-checkbox value. Emptiness is only a failure for a REQUIRED field: an optional
 * field submitted as whitespace is a value the author chose to send, and rejecting it here would
 * refuse a submission the form's own definition permits.
 *
 * @complexity O(v) in the value's length (one `trim`).
 */
function resolveTextValue(field: FieldDescriptor, value: unknown): SubmittedValue {
  if (typeof value !== "string") return { kind: "rejected", reason: "must be a string" };
  if (field.required && value.trim() === "") return { kind: "rejected", reason: "required" };
  if (field.maxLength != null && value.length > field.maxLength) return { kind: "rejected", reason: "too_long" };
  return { kind: "accepted", value };
}

/**
 * Resolves one declared field against the raw body.
 *
 * `null` and `undefined` are the same signal — absence — because a JSON body and an HTML form post
 * disagree about which one they send for "nothing". `false` is NOT absence: a required checkbox
 * submitted unticked is a real answer, and treating it as missing would make an unticked required
 * checkbox unsubmittable.
 *
 * @complexity O(v) in the value's length, via {@link resolveTextValue}.
 */
function resolveSubmittedValue(field: FieldDescriptor, value: unknown): SubmittedValue {
  if (value === undefined || value === null) {
    return field.required ? { kind: "rejected", reason: "required" } : { kind: "absent" };
  }
  if (field.type === "checkbox") {
    return typeof value === "boolean" ? { kind: "accepted", value } : { kind: "rejected", reason: "must be a boolean" };
  }
  return resolveTextValue(field, value);
}

/**
 * C-003/REQ-06/INV-01 — validates a raw submission body against a definition's declared fields:
 * required fields present, `maxLength` respected, no keys outside the declared fields plus the
 * reserved `_hp` honeypot key (EC-01/EC-02). The sole gate guaranteeing `data`'s keys are always a
 * subset of the definition's field ids (INV-01).
 *
 * Every unregistered key is reported before any declared-field error, and declared fields report
 * in DEFINITION order rather than body order, so two clients sending the same fields in different
 * key orders get byte-identical error lists.
 *
 * @complexity O(n) over declared fields + body keys.
 * @overallScore 100
 */
export function validateSubmissionPayload(input: ValidateSubmissionPayloadInput): SubmissionValidationResult {
  const { definition, body } = input;
  const fieldsById = new Map<string, FieldDescriptor>(definition.fields.map((f) => [f.id, f]));

  const fieldErrors: FieldError[] = unregisteredKeyErrors(body, fieldsById);
  const data: Record<string, string | boolean> = {};

  for (const field of definition.fields) {
    const resolved = resolveSubmittedValue(field, body[field.id]);
    if (resolved.kind === "rejected") {
      fieldErrors.push({ field: field.id, reason: resolved.reason });
    } else if (resolved.kind === "accepted") {
      data[field.id] = resolved.value;
    }
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
