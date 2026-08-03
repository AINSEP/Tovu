import { useEffect, useRef, useState } from "react";
import { api, type AdminFormDefinition, type AdminFormField, type AdminFormNotify, type AdminFormSubmission } from "../lib/api";
import { navigate } from "../lib/router";
import { DataTable } from "@jini-ai/admin/react";
import "../styles/form-field-attrs.css";

/**
 * @file Form editor screen (SPEC-010 ui.spec.md §2.2-2.5/§3.2-3.5) — the `/admin/forms/:formId` route.
 * Internally composed of `FormFieldsEditor`, `FormSubmissions`, `FormSubmissionDetail` (single
 * flat file per this admin app's convention — same escape hatch ADR-PIPE-007 pre-approved for
 * `Settings.tsx`). `formId === "new"` renders the create form; the slug field is editable only
 * in that case (behavior.spec.md §1.1).
 *
 * Layout pass (forms-audit): this screen was flagged as the worst-looking surface in the admin —
 * every button rendered as the identical filled-primary orange (Save and the access-affecting
 * Disable toggle were visually indistinguishable), the Fields/Submissions tabs had `role="tab"`
 * semantics but zero visual tab styling, label text ran straight into its input with no gap, the
 * fields table had no horizontal-scroll escape hatch for its many columns, and none of it adapted
 * below desktop width. This pass moves the screen onto the shared page primitives `styles.css`
 * introduced for the Posts/Media canary pass (`.page`/`.page-header`/`.card`/`.field*`/
 * `.table-scroll`) plus a small new partial (`styles/forms.css`) for the tab strip and the
 * checkbox+label row those primitives don't cover. Layout/hierarchy/semantics only — no change to
 * data flow, API calls, or the guard below.
 *
 * Per-field CSS classes + HTML attributes (this pass): the field table was already at its column
 * budget (six columns, fixed-percentage `<colgroup>`, see `FormFieldsEditor`'s own comment below),
 * so two more free-text properties could not become two more columns. Each row instead gets a
 * seventh, narrow "MORE" column holding a vertical three-dot (⋮) trigger that opens
 * `FieldAttributesDialog` — a real modal (`.settings-dialog-backdrop`/`.settings-dialog`, the
 * `Collections.tsx` `EditFieldsDialog` idiom), not a side panel, since the AI chat dock already
 * occupies the right edge of this app. The trigger reuses `RowMenu`'s (`@jini-ai/admin/react`) own
 * glyph markup verbatim (three `<circle>`s at increasing `cy`, i.e. stacked vertically — confirmed
 * from that component's own source, not assumed) and its `.row-menu-trigger` class (`styles.css`)
 * rather than drawing a second glyph, and its "MORE" column header — but is a plain button, not a
 * `RowMenu` instance — `RowMenu` models a dropdown of several actions (open it, THEN pick one), and
 * this is a single action ("open the modal"), so routing it through a one-item dropdown would cost
 * an extra click for no benefit. `styles/form-field-attrs.css` (imported above) is this dialog's
 * own partial, same self-imported-by-the-component precedent as `styles/select.css`/`Select.tsx`.
 *
 * The security-relevant half of this lives server-side, not here: `forms.ts`'s
 * `validateFieldDescriptors` is the real gate on attribute NAMES (a closed allowlist —
 * `ATTRIBUTE_NAME_PATTERN`), enforced identically for this admin UI and for `agent-tools.ts`'s
 * agent-facing schema. This file's own `ATTRIBUTE_NAME_PATTERN` constant below is a disclosed
 * duplicate for a fast, pre-save error message only (same pattern `Collections.tsx`'s
 * `validateFieldName`/`KEY_GRAMMAR` already uses) — it is never the authoritative check.
 */

const FIELD_TYPES = ["text", "email", "textarea", "checkbox"] as const;

/** The two tab-panel views on an existing form's editor (`formId !== "new"`). */
const FORM_TABS = [
  { id: "fields", label: "Fields" },
  { id: "submissions", label: "Submissions" },
] as const;

/**
 * Roving-tabindex arrow-key step for the Fields/Submissions tablist — ArrowLeft/ArrowRight cycle
 * between the two tabs, Home/End jump to the first/last. Split out from the `onKeyDown` handler so
 * the index math carries no dependency on the DOM/React event type; the JSX handler that calls
 * this stays a small inline function, same convention as `Taxonomy.tsx`'s row `onKeyDown`.
 * @complexity O(1) — `FORM_TABS` is a fixed 2-item array.
 */
function nextTabIndex(key: string, currentIndex: number): number | null {
  if (key === "ArrowRight") return (currentIndex + 1) % FORM_TABS.length;
  if (key === "ArrowLeft") return (currentIndex - 1 + FORM_TABS.length) % FORM_TABS.length;
  if (key === "Home") return 0;
  if (key === "End") return FORM_TABS.length - 1;
  return null;
}

function blankField(): AdminFormField {
  return { id: "", label: "", type: "text", required: false };
}

/** Shared "what do we call this field in a title/label" fallback — a blank draft field has neither
 *  a label nor an id yet, so both the kebab's `aria-label` and the modal's own `<h2>` need the same
 *  `label -> id -> "Field N"` chain rather than risking the two drifting apart. */
function fieldDisplayName(field: AdminFormField, index: number): string {
  return field.label || field.id || `Field ${index + 1}`;
}

// ---------------------------------------------------------------------------
// Field attributes modal (per-field CSS classes + HTML attributes)
// ---------------------------------------------------------------------------

/** Mirrors `forms.ts`'s `ATTRIBUTE_NAME_PATTERN` exactly — see this file's own header comment for
 *  why this is a fast-reject-only duplicate, not the authoritative check. Keep in sync by hand if
 *  the server allowlist changes. */
const ATTRIBUTE_NAME_PATTERN =
  /^(aria-[a-z0-9-]+|data-[a-z0-9-]+|placeholder|autocomplete|inputmode|pattern|title|min|max|step|minlength|spellcheck|readonly)$/;

/** Same bounds as `forms.ts`'s `MAX_CLASS_NAME_LENGTH`/`MAX_ATTRIBUTES_PER_FIELD` — client-side
 *  early-reject only, not enforcement (see `ATTRIBUTE_NAME_PATTERN` above). */
const MAX_CLASS_NAME_LENGTH = 300;
const MAX_ATTRIBUTES_PER_FIELD = 12;

/** A handful of the allowlisted names as real, pickable suggestions (the modal's own "here's what
 *  you can do" surface — an operator has no other way to discover the allowlist) rather than every
 *  one: `aria-*`/`data-*` are open namespaces, so `aria-label`/`data-testid` stand in for the whole
 *  prefix family instead of listing every field-specific `aria-*` name that doesn't exist yet. */
const ATTRIBUTE_NAME_SUGGESTIONS = [
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
 *  stable identity — same `_rowId`/module-counter pattern `Collections.tsx`'s `EditFieldsDialog`
 *  uses for its own draft field rows. */
let nextAttrRowId = 0;

interface AttrRow {
  _rowId: number;
  name: string;
  value: string;
}

function attrRowsFromField(field: AdminFormField): AttrRow[] {
  return Object.entries(field.attributes ?? {}).map(([name, value]) => ({ _rowId: nextAttrRowId++, name, value }));
}

function FieldAttributesDialog(props: {
  field: AdminFormField;
  fieldIndex: number;
  onSave: (patch: Partial<AdminFormField>) => void;
  onCancel: () => void;
}) {
  const { field } = props;
  const [className, setClassName] = useState(field.className ?? "");
  const [rows, setRows] = useState<AttrRow[]>(() => attrRowsFromField(field));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") props.onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateRow(rowId: number, patch: Partial<AttrRow>) {
    setRows((current) => current.map((r) => (r._rowId === rowId ? { ...r, ...patch } : r)));
  }
  function removeRow(rowId: number) {
    setRows((current) => current.filter((r) => r._rowId !== rowId));
  }
  function addRow() {
    setRows((current) => [...current, { _rowId: nextAttrRowId++, name: "", value: "" }]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedClassName = className.trim();
    if (trimmedClassName.length > MAX_CLASS_NAME_LENGTH) {
      setError(`CSS classes must be at most ${MAX_CLASS_NAME_LENGTH} characters.`);
      return;
    }

    const attributes: Record<string, string> = {};
    for (const row of rows) {
      const name = row.name.trim();
      if (!name) continue;
      if (!ATTRIBUTE_NAME_PATTERN.test(name)) {
        setError(`Attribute "${name}" isn't allowed. Use aria-*, data-*, or one of the suggested names.`);
        return;
      }
      attributes[name] = row.value;
    }
    if (Object.keys(attributes).length > MAX_ATTRIBUTES_PER_FIELD) {
      setError(`At most ${MAX_ATTRIBUTES_PER_FIELD} attributes are allowed per field.`);
      return;
    }

    props.onSave({
      className: trimmedClassName || undefined,
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
    });
  }

  return (
    <div className="settings-dialog-backdrop" onClick={props.onCancel}>
      <form
        className="settings-dialog field-attrs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-attrs-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="field-attrs-title">
          Field attributes — {fieldDisplayName(field, props.fieldIndex)}
        </h2>
        <p className="field-attrs-hint">
          Add CSS classes and HTML attributes to this field&rsquo;s input. Classes are unrestricted — Tailwind
          utility classes like <code>md:col-span-2</code> or <code>w-1/2</code> work as expected. Attribute names
          are limited to a safe allowlist (<code>aria-*</code>, <code>data-*</code>, and a fixed list of
          layout/behavior attributes) — anything else, including event handlers like <code>onclick</code>, is
          rejected.
        </p>

        <div className="field">
          <label className="field-label" htmlFor="field-attrs-classname">
            CSS classes
          </label>
          <input
            id="field-attrs-classname"
            value={className}
            placeholder="e.g. md:col-span-2 w-1/2 focus:ring-2"
            onChange={(e) => setClassName(e.target.value)}
          />
        </div>

        <div className="field-attrs-rows">
          <span className="field-label">HTML attributes</span>
          <datalist id="field-attrs-name-suggestions">
            {ATTRIBUTE_NAME_SUGGESTIONS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {rows.map((row, index) => (
            <fieldset key={row._rowId} className="collections-field-row">
              <legend>Attribute {index + 1}</legend>
              <div className="field">
                <label className="field-label" htmlFor={`field-attrs-name-${row._rowId}`}>
                  Name
                </label>
                <input
                  id={`field-attrs-name-${row._rowId}`}
                  list="field-attrs-name-suggestions"
                  value={row.name}
                  placeholder="e.g. aria-label"
                  onChange={(e) => updateRow(row._rowId, { name: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`field-attrs-value-${row._rowId}`}>
                  Value
                </label>
                <input
                  id={`field-attrs-value-${row._rowId}`}
                  value={row.value}
                  placeholder="e.g. Enter your work email"
                  onChange={(e) => updateRow(row._rowId, { value: e.target.value })}
                />
              </div>
              <button type="button" className="btn-secondary" onClick={() => removeRow(row._rowId)}>
                Remove
              </button>
            </fieldset>
          ))}
          <button type="button" className="btn-secondary" onClick={addRow}>
            Add attribute
          </button>
        </div>

        {error ? (
          <span className="save-error" role="alert">
            {error}
          </span>
        ) : null}

        <span className="editor-actions">
          <button type="submit">Save</button>
          <button type="button" className="btn-secondary" onClick={props.onCancel}>
            Cancel
          </button>
        </span>
      </form>
    </div>
  );
}

function FormFieldsEditor(props: {
  fields: AdminFormField[];
  existingFieldIds?: string[];
  onChange: (fields: AdminFormField[]) => void;
}) {
  const { fields, existingFieldIds = [], onChange } = props;
  // Which field's `FieldAttributesDialog` is open, by index — `null` when none is. Only one can be
  // open at a time (opening a second replaces the first, same single-modal-at-a-time discipline
  // every other dialog in this admin follows).
  const [editingAttrsIndex, setEditingAttrsIndex] = useState<number | null>(null);
  // Per-row kebab triggers, indexed the same as `fields` — so focus can return to the trigger that
  // opened the dialog once it closes (WCAG 2.1 AA "focus returns to trigger element when modal
  // closes"; neither `Collections.tsx`'s `EditFieldsDialog` nor this file's other dialog do this
  // today, so this is a small net-new improvement rather than matched-to-precedent behavior).
  const kebabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function closeAttrsDialog() {
    const index = editingAttrsIndex;
    setEditingAttrsIndex(null);
    if (index !== null) kebabRefs.current[index]?.focus();
  }

  function updateField(index: number, patch: Partial<AdminFormField>) {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }
  function addField() {
    onChange([...fields, blankField()]);
  }
  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  return (
    <>
      <table className="list-table form-fields-table">
        {/* Fixed proportional column widths (`forms.css`'s `table-layout: fixed`) rather than the
            browser's default content-driven auto layout — every cell here holds a live, unstyled-
            width `<input>`/`<select>`, so auto layout let six of them each claim their own
            intrinsic ~180px, pushing the table to ~925px wide at a 640px viewport (measured before
            this fix) with no visible cue that "Max length"/Remove were still reachable by scrolling
            `.table-scroll`. Percentages sized to what each column actually holds: ID/Label get the
            most room since they're the fields an operator actually reads, Required/Max length the
            least since a checkbox and a short number never need more.

            A seventh "MORE" column (this pass) holds the vertical-kebab trigger for
            `FieldAttributesDialog` — sized the same 8% as Req, since it holds nothing but one
            30px round icon button and never needs more. Taken entirely out of the Remove column's
            own share (26% -> 18%) rather than shrinking any of the five text/control columns, so
            ID/Label/Type/Req/Max length keep the exact widths the 640px fix already measured and
            fixed. */}
        <colgroup>
          <col style={{ width: "14%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>ID</th>
            <th>Label</th>
            <th>Type</th>
            {/* "Required" is one unbreakable word — at this column's necessarily checkbox-sized
                width it has nowhere to wrap to and was visibly overflowing into "Max length"'s own
                header. "Req" reads fine sitting directly above the checkbox it labels; the row
                cell's own `aria-label` ("Field N required", unchanged below) still says the full
                word for anyone not reading the visual header at all. */}
            <th>Req</th>
            <th>Max length</th>
            {/* "More" — the exact literal string `FormsList.tsx`'s own `RowMenu` column header
                uses (confirmed by reading that file, not just the rendered DOM); `.list-table th`
                (`styles.css`) uppercases it visually to "MORE", same as every other header in this
                table (e.g. "Max length" above renders as "MAX LENGTH"). */}
            <th>More</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => {
            const isExisting = existingFieldIds.includes(field.id);
            return (
              <tr key={index}>
                <td>
                  <input
                    aria-label={`Field ${index + 1} id`}
                    value={field.id}
                    disabled={isExisting}
                    onChange={(e) => updateField(index, { id: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Field ${index + 1} label`}
                    value={field.label}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    aria-label={`Field ${index + 1} type`}
                    value={field.type}
                    onChange={(e) => updateField(index, { type: e.target.value as AdminFormField["type"] })}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Field ${index + 1} required`}
                    checked={field.required}
                    onChange={(e) => updateField(index, { required: e.target.checked })}
                  />
                </td>
                <td>
                  {field.type === "checkbox" ? (
                    <span aria-hidden="true">—</span>
                  ) : (
                    <input
                      type="number"
                      aria-label={`Field ${index + 1} max length`}
                      value={field.maxLength ?? ""}
                      onChange={(e) =>
                        updateField(index, { maxLength: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  )}
                </td>
                <td>
                  {/* Reuses `RowMenu`'s (`@jini-ai/admin/react`) own kebab glyph and
                      `.row-menu-trigger` class (`styles.css`) rather than drawing a second kebab —
                      see this file's header comment for why this is a plain button (single action)
                      instead of a `RowMenu` instance (which models a dropdown of several). */}
                  <button
                    ref={(el) => {
                      kebabRefs.current[index] = el;
                    }}
                    type="button"
                    className="row-menu-trigger"
                    aria-label={`Attributes for field "${fieldDisplayName(field, index)}"`}
                    onClick={() => setEditingAttrsIndex(index)}
                  >
                    <svg viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
                      <circle cx="9" cy="4.5" r="1.5" />
                      <circle cx="9" cy="9" r="1.5" />
                      <circle cx="9" cy="13.5" r="1.5" />
                    </svg>
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    disabled={isExisting}
                    title={isExisting ? "Existing fields cannot be removed once created" : undefined}
                    onClick={() => removeField(index)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7}>
              <button type="button" className="btn-secondary" onClick={addField}>
                Add field
              </button>
            </td>
          </tr>
        </tfoot>
      </table>
      {editingAttrsIndex !== null && fields[editingAttrsIndex] ? (
        <FieldAttributesDialog
          field={fields[editingAttrsIndex]}
          fieldIndex={editingAttrsIndex}
          onSave={(patch) => {
            updateField(editingAttrsIndex, patch);
            closeAttrsDialog();
          }}
          onCancel={closeAttrsDialog}
        />
      ) : null}
    </>
  );
}

function FormSubmissionDetail(props: {
  formId: string;
  submissionId: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [submission, setSubmission] = useState<AdminFormSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .getFormSubmission({ formId: props.formId, submissionId: props.submissionId })
      .then((r) => setSubmission(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load submission"));
  }, [props.formId, props.submissionId]);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await api.deleteFormSubmission({ formId: props.formId, submissionId: props.submissionId });
      props.onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
      setDeleting(false);
    }
  }

  if (error && !submission) return <div className="notice error">{error}</div>;
  if (!submission) return <div className="notice">Loading submission…</div>;

  return (
    <div>
      <button type="button" className="btn-secondary" onClick={props.onBack}>
        &larr; Back to submissions
      </button>
      {error ? <div className="notice error">{error}</div> : null}
      <div className="table-scroll">
        <table className="list-table">
          <tbody>
            <tr>
              <th>Submitted at</th>
              <td>{submission.submittedAt}</td>
            </tr>
            <tr>
              <th>Source IP</th>
              <td>{submission.sourceIp}</td>
            </tr>
            {Object.entries(submission.data).map(([key, value]) => (
              <tr key={key}>
                <th>{key}</th>
                <td>{String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn-danger" disabled={deleting} onClick={handleDelete}>
        {confirming ? "Confirm delete" : "Delete submission"}
      </button>
    </div>
  );
}

function FormSubmissions(props: { formId: string }) {
  const [submissions, setSubmissions] = useState<AdminFormSubmission[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function load(cursor?: string) {
    api
      .listFormSubmissions({ formId: props.formId }, cursor ? { cursor } : {})
      .then((r) => {
        setSubmissions((prev) => (cursor ? [...(prev ?? []), ...r.data] : r.data));
        setNextCursor(r.nextCursor);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load submissions"));
  }

  useEffect(() => load(), [props.formId]);

  if (selectedId) {
    return (
      <FormSubmissionDetail
        formId={props.formId}
        submissionId={selectedId}
        onBack={() => setSelectedId(null)}
        onDeleted={() => {
          setSelectedId(null);
          load();
        }}
      />
    );
  }

  if (error && !submissions) return <div className="notice error">{error}</div>;
  if (!submissions) return <div className="notice">Loading submissions…</div>;
  if (submissions.length === 0) return <div className="empty-state">No submissions yet.</div>;

  return (
    <div>
      {error ? <div className="notice error">{error}</div> : null}
      <DataTable
        rows={submissions}
        rowKey={(s) => s.id}
        columns={[
          { key: "submitted-at", header: "Submitted at", cell: (s) => s.submittedAt },
          { key: "source-ip", header: "Source IP", cell: (s) => s.sourceIp },
          {
            key: "view",
            cell: (s) => (
              <button type="button" onClick={() => setSelectedId(s.id)}>
                View
              </button>
            ),
          },
        ]}
      />
      {nextCursor ? (
        <button type="button" className="btn-secondary" onClick={() => load(nextCursor)}>
          Load more
        </button>
      ) : null}
    </div>
  );
}

export function FormEditor(props: { formId: string }) {
  const isNew = props.formId === "new";
  const [form, setForm] = useState<AdminFormDefinition | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [fields, setFields] = useState<AdminFormField[]>([blankField()]);
  const [notify, setNotify] = useState<AdminFormNotify>({ enabled: false, recipients: [] });
  const [recipientsText, setRecipientsText] = useState("");
  const [tab, setTab] = useState<"fields" | "submissions">("fields");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Roving-tabindex focus targets for the tab strip below, indexed the same as `FORM_TABS` — see
  // `nextTabIndex`'s doc comment for why the index math itself lives outside the component.
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function load() {
    if (isNew) return;
    api
      .getForm(props.formId)
      .then((r) => {
        setForm(r.data);
        setName(r.data.name);
        setSlug(r.data.slug);
        setFields(r.data.fields);
        setNotify(r.data.notify);
        setRecipientsText(r.data.notify.recipients.join(", "));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load form"));
  }

  useEffect(load, [props.formId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const recipients = recipientsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const notifyPayload = { ...notify, recipients };
    try {
      if (isNew) {
        const created = await api.createForm({ name, slug, fields }, { notify: notifyPayload });
        navigate(`/forms/${created.data.id}`);
      } else {
        await api.updateForm({ id: props.formId }, { name, fields, notify: notifyPayload });
        load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusToggle() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateForm({ id: form.id }, { status: form.status === "active" ? "disabled" : "active" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "status update failed");
    } finally {
      setSaving(false);
    }
  }

  if (!isNew && !form && !error) return <div className="notice">Loading form…</div>;
  // Previously this was the ONLY guard, and it only covers the pre-error case — once the load
  // failed and set `error`, `!error` here goes false and rendering fell through to the full,
  // empty, live-saveable editor below (audit blocker, exec summary #3: a bogus form id showed
  // "form definition 'X' was not found" AND a working Save button underneath it). This guard is
  // safe to add as a second, separate check rather than merging into the one above: it only fires
  // while `form` is still null, so a load failure has to happen before the form ever loaded —
  // once `form` is set, it stays set, so a LATER failure (e.g. a failed Save) never re-enters
  // this branch and never blanks a screen the operator is already editing (same "a later failure
  // must not erase what already rendered" principle as `Pages.tsx`/`Posts.tsx`'s `error && !data`
  // guard — see `CollectionEntryEditor.tsx`'s sequential loading → not-found guards for the
  // reference shape this now matches).
  if (!isNew && !form && error) return <div className="notice error">{error}</div>;

  const existingFieldIds = form ? form.fields.map((f) => f.id) : [];
  const showTabs = !isNew && form !== null;

  // Shared between the "new form" (no tabs, always visible) and "existing form, Fields tab"
  // views — kept as one JSX value instead of two copies so the two paths can't drift.
  const fieldsBody = (
    <>
      <div className="field-group">
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="form-name">
              Name
            </label>
            <input id="form-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="form-slug">
              Slug
            </label>
            <input id="form-slug" value={slug} disabled={!isNew} onChange={(e) => setSlug(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="field-group">
        <div className="table-scroll">
          <FormFieldsEditor fields={fields} existingFieldIds={existingFieldIds} onChange={setFields} />
        </div>
      </div>

      <div className="field-group">
        <label className="form-checkbox-field">
          <input
            type="checkbox"
            checked={notify.enabled}
            onChange={(e) => setNotify({ ...notify, enabled: e.target.checked })}
          />
          Enable email notification
        </label>
        {notify.enabled ? (
          <div className="field">
            <label className="field-label" htmlFor="form-recipients">
              Recipients (comma-separated)
            </label>
            <input id="form-recipients" value={recipientsText} onChange={(e) => setRecipientsText(e.target.value)} />
          </div>
        ) : null}
      </div>

      {/* `form-actions` is a spacing-only hook layered on top of the shared `.editor-actions`
          flex row. `.editor-actions` sets direction/gap/alignment but no top margin, and this row
          is not a `.field-group`, so the `.field-group + .field-group` rhythm that separates every
          other block on this screen skips it — leaving Disable/Save flush against the Recipients
          input. Fixed here rather than by adding a margin to `.editor-actions` itself, because that
          class is shared with the other editor screens and a global change would shift spacing on
          screens nobody has looked at yet. */}
      <div className="editor-actions form-actions">
        {!isNew && form ? (
          // Reversible-but-access-affecting (turns off the live site's ability to accept
          // submissions through this form) — `.btn-warning`, not `.btn-danger`: nothing is
          // deleted, and the same control flips right back to "Enable". Re-enabling is the safe
          // direction, so it stays `.btn-secondary` rather than inheriting the warning look.
          <button
            type="button"
            className={form.status === "active" ? "btn-warning" : "btn-secondary"}
            disabled={saving}
            onClick={handleStatusToggle}
          >
            {form.status === "active" ? "Disable" : "Enable"}
          </button>
        ) : null}
        <button type="button" disabled={saving} onClick={handleSave}>
          {isNew ? "Create form" : "Save"}
        </button>
      </div>
    </>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">{isNew ? "New form" : name || "Form"}</h1>
          <p className="page-description">
            {isNew
              ? "Configure a new form's fields and email notifications."
              : "Configure this form's fields and notifications, or review its submissions."}
          </p>
        </div>
        <div className="page-actions">
          <a href="/admin/forms">
            <button type="button" className="btn-secondary">
              Back to forms
            </button>
          </a>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}

      {showTabs ? (
        <div
          className="form-tabs"
          role="tablist"
          aria-label="Form sections"
          onKeyDown={(e) => {
            const currentIndex = FORM_TABS.findIndex((t) => t.id === tab);
            const index = nextTabIndex(e.key, currentIndex);
            if (index === null) return;
            e.preventDefault();
            setTab(FORM_TABS[index].id);
            tabRefs.current[index]?.focus();
          }}
        >
          {FORM_TABS.map((t, index) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`form-tab-${t.id}`}
              className="form-tab"
              aria-selected={tab === t.id}
              aria-controls={`form-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {isNew ? (
        <div className="card">{fieldsBody}</div>
      ) : tab === "fields" ? (
        <div className="card" role="tabpanel" id="form-panel-fields" aria-labelledby="form-tab-fields">
          {fieldsBody}
        </div>
      ) : (
        <div className="card" role="tabpanel" id="form-panel-submissions" aria-labelledby="form-tab-submissions">
          <FormSubmissions formId={props.formId} />
        </div>
      )}
    </div>
  );
}
