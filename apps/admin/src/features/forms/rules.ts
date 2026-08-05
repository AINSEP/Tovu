import type { AdminFormDefinition, AdminFormField } from "../../lib/api";

/**
 * @file Pure logic for the `forms` feature (`FormEditor.tsx` — see `FormsList.tsx`'s own
 * `rules.ts`/hook for the list screen's extraction) — everything that computes a value rather than
 * rendering one. Follows the convention `features/posts/rules.ts` establishes: no React, no
 * hooks, importable and directly testable.
 *
 * One deliberate exception to "pure", same as `collections/rules.ts`'s `nextRowId`:
 * {@link nextAttrRowId} is a module-level counter `attrRowsFromField`/`addAttrRow` advance. Only
 * `FieldAttributesDialog` (via `use-field-attributes-dialog.hooks.ts`) consumes it today, so it
 * would be equally correct sitting in that hook file — kept here instead for the same reason
 * `collections/rules.ts` keeps its row-id counter alongside its other draft-list transforms: one
 * place for "how draft rows get local keys" per feature, not split by which hook happens to use it
 * first.
 */

export const FIELD_TYPES = ["text", "email", "textarea", "checkbox"] as const;

/** The two tab-panel views on an existing form's editor (`formId !== "new"`). */
export const FORM_TABS = [
  { id: "fields", label: "Fields" },
  { id: "submissions", label: "Submissions" },
] as const;

/**
 * Roving-tabindex arrow-key step for the Fields/Submissions tablist — ArrowLeft/ArrowRight cycle
 * between the two tabs, Home/End jump to the first/last.
 *
 * @complexity O(1) — `FORM_TABS` is a fixed 2-item array.
 */
export function nextTabIndex(key: string, currentIndex: number): number | null {
  if (key === "ArrowRight") return (currentIndex + 1) % FORM_TABS.length;
  if (key === "ArrowLeft") return (currentIndex - 1 + FORM_TABS.length) % FORM_TABS.length;
  if (key === "Home") return 0;
  if (key === "End") return FORM_TABS.length - 1;
  return null;
}

export function blankField(): AdminFormField {
  return { id: "", label: "", type: "text", required: false };
}

/** Shared "what do we call this field in a title/label" fallback — a blank draft field has neither
 *  a label nor an id yet, so both the kebab's `aria-label` and the modal's own `<h2>` need the same
 *  `label -> id -> "Field N"` chain rather than risking the two drifting apart. */
export function fieldDisplayName(field: AdminFormField, index: number): string {
  return field.label || field.id || `Field ${index + 1}`;
}

/** @complexity O(n) in `fields.length`. */
export function updateFormField(fields: AdminFormField[], index: number, patch: Partial<AdminFormField>): AdminFormField[] {
  return fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
}

/** @complexity O(n) in `fields.length`. */
export function addFormField(fields: AdminFormField[]): AdminFormField[] {
  return [...fields, blankField()];
}

/** @complexity O(n) in `fields.length`. */
export function removeFormField(fields: AdminFormField[], index: number): AdminFormField[] {
  return fields.filter((_, i) => i !== index);
}

/** The already-persisted field ids on a form — `FormFieldsEditor` disables the id input and the
 *  Remove button for these (a saved field's id cannot be changed or removed once created). `null`
 *  (form not loaded yet, or the "new form" case) has no existing ids. */
export function existingFieldIdsOf(form: AdminFormDefinition | null): string[] {
  return form ? form.fields.map((f) => f.id) : [];
}

/**
 * Splits the notification recipients textarea into the trimmed, non-empty address list
 * `api.createForm`/`api.updateForm` expect.
 *
 * @complexity O(n) in `recipientsText.length`.
 */
export function parseRecipients(recipientsText: string): string[] {
  return recipientsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Field attributes modal (per-field CSS classes + HTML attributes)
// ---------------------------------------------------------------------------

/** Mirrors `forms.ts`'s `ATTRIBUTE_NAME_PATTERN` exactly — see `FormEditor.tsx`'s own header
 *  comment for why this is a fast-reject-only duplicate, not the authoritative check. Keep in sync
 *  by hand if the server allowlist changes. */
export const ATTRIBUTE_NAME_PATTERN =
  /^(aria-[a-z0-9-]+|data-[a-z0-9-]+|placeholder|autocomplete|inputmode|pattern|title|min|max|step|minlength|spellcheck|readonly)$/;

/** Same bounds as `forms.ts`'s `MAX_CLASS_NAME_LENGTH`/`MAX_ATTRIBUTES_PER_FIELD` — client-side
 *  early-reject only, not enforcement (see `ATTRIBUTE_NAME_PATTERN` above). */
export const MAX_CLASS_NAME_LENGTH = 300;
export const MAX_ATTRIBUTES_PER_FIELD = 12;

/** A handful of the allowlisted names as real, pickable suggestions (the modal's own "here's what
 *  you can do" surface — an operator has no other way to discover the allowlist) rather than every
 *  one: `aria-*`/`data-*` are open namespaces, so `aria-label`/`data-testid` stand in for the whole
 *  prefix family instead of listing every field-specific `aria-*` name that doesn't exist yet. */
export const ATTRIBUTE_NAME_SUGGESTIONS = [
  "aria-label",
  "aria-describedby",
  "data-testid",
  "placeholder",
  "autocomplete",
  "inputmode",
  "pattern",
  "title",
  "min",
  "max",
  "step",
  "minlength",
  "spellcheck",
  "readonly",
];

/** Local-only row key for the modal's attribute list, so React can key a row before it has a
 *  stable identity — same `_rowId`/module-counter pattern `collections/rules.ts`'s
 *  `EditFieldsDialog` support uses for its own draft field rows. */
let nextAttrRowId = 0;

export interface AttrRow {
  _rowId: number;
  name: string;
  value: string;
}

export function attrRowsFromField(field: AdminFormField): AttrRow[] {
  return Object.entries(field.attributes ?? {}).map(([name, value]) => ({ _rowId: nextAttrRowId++, name, value }));
}

/** @complexity O(n) in `rows.length`. */
export function updateAttrRow(rows: AttrRow[], rowId: number, patch: Partial<AttrRow>): AttrRow[] {
  return rows.map((r) => (r._rowId === rowId ? { ...r, ...patch } : r));
}

/** @complexity O(n) in `rows.length`. */
export function removeAttrRow(rows: AttrRow[], rowId: number): AttrRow[] {
  return rows.filter((r) => r._rowId !== rowId);
}

/** @complexity O(n) in `rows.length`. */
export function addAttrRow(rows: AttrRow[]): AttrRow[] {
  return [...rows, { _rowId: nextAttrRowId++, name: "", value: "" }];
}

export type FieldAttributesSubmitResult = { ok: true; patch: Partial<AdminFormField> } | { ok: false; error: string };

/**
 * Validates + shapes `FieldAttributesDialog`'s draft into the `Partial<AdminFormField>` patch
 * `onSave` applies: a class-name length cap, then every named attribute row against the allowlist
 * (blank names are silently skipped — an empty trailing row is not an error), then a total-count
 * cap on the surviving attributes. The security-relevant check is server-side (`forms.ts`'s
 * `validateFieldDescriptors`); this is the fast, pre-save rejection only — see this feature's own
 * `ATTRIBUTE_NAME_PATTERN` doc.
 *
 * @complexity O(n) in `rows.length`, short-circuiting on the first disallowed name.
 */
export function buildFieldAttributesPatch(draft: { className: string; rows: AttrRow[] }): FieldAttributesSubmitResult {
  const trimmedClassName = draft.className.trim();
  if (trimmedClassName.length > MAX_CLASS_NAME_LENGTH) {
    return { ok: false, error: `CSS classes must be at most ${MAX_CLASS_NAME_LENGTH} characters.` };
  }

  const attributes: Record<string, string> = {};
  for (const row of draft.rows) {
    const name = row.name.trim();
    if (!name) continue;
    if (!ATTRIBUTE_NAME_PATTERN.test(name)) {
      return { ok: false, error: `Attribute "${name}" isn't allowed. Use aria-*, data-*, or one of the suggested names.` };
    }
    attributes[name] = row.value;
  }
  if (Object.keys(attributes).length > MAX_ATTRIBUTES_PER_FIELD) {
    return { ok: false, error: `At most ${MAX_ATTRIBUTES_PER_FIELD} attributes are allowed per field.` };
  }

  return {
    ok: true,
    patch: {
      className: trimmedClassName || undefined,
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
    },
  };
}
