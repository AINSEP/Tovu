import { ConfirmDialog, DataTable } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { SeeMore } from "../../components/SeeMore/SeeMore";
import "../../styles/form-field-attrs.css";

import type { AdminFormDefinition, AdminFormField, AdminFormNotify } from "../../lib/api";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { ATTRIBUTE_NAME_SUGGESTIONS, FIELD_TYPES, FORM_TABS, fieldDisplayName } from "./rules";
import { useFieldAttributesDialog } from "./hooks/use-field-attributes-dialog.hooks";
import { useFormFieldsEditor } from "./hooks/use-form-fields-editor.hooks";
import { useWiredFormSubmissionDetail } from "./hooks/use-form-submission-detail.hooks";
import { useWiredFormSubmissions } from "./hooks/use-form-submissions.hooks";
import { useWiredFormEditor } from "./hooks/use-form-editor.hooks";

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
 * agent-facing schema. This file's own `ATTRIBUTE_NAME_PATTERN` constant (now in `rules.ts`) is a
 * disclosed duplicate for a fast, pre-save error message only (same pattern `Collections.tsx`'s
 * `validateFieldName`/`KEY_GRAMMAR` already uses) — it is never the authoritative check.
 *
 * ## Markup only
 *
 * Every component's state now lives in its own `hooks/use-<thing>.hooks.ts`; pure logic (field-list
 * transforms, tab-index math, the attribute allowlist check, recipients parsing) lives in
 * `rules.ts`.
 */

// ---------------------------------------------------------------------------
// Field attributes modal (per-field CSS classes + HTML attributes)
// ---------------------------------------------------------------------------

export interface FieldAttributesDialogProps {
  field: AdminFormField;
  fieldIndex: number;
  onSave: (patch: Partial<AdminFormField>) => void;
  onCancel: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useFieldAttributesDialogHook?: typeof useFieldAttributesDialog;
  /** Translator closure — see `FormEditor()`'s own `t`. */
  t: (key: string) => string;
}

function FieldAttributesDialog({
  field,
  fieldIndex,
  onSave,
  onCancel,
  useFieldAttributesDialogHook = useFieldAttributesDialog,
  t,
}: FieldAttributesDialogProps) {
  const { className, setClassName, rows, updateRow, removeRow, addRow, error, submit } = useFieldAttributesDialogHook({
    field,
    onSave,
    onCancel,
  });
  // One dialog is ever open at a time (`editingAttrsIndex` gates a single instance below), so this
  // needs no per-instance disambiguation — unlike the attribute rows inside it, which are a real
  // repeated list and do need `buildAgentListHandles`'s uniqueness search. Not `useMemo`d: `rows` is
  // one field's own CSS-class/HTML-attribute rows (a handful at most), cheap enough that memoizing
  // it was not judged worth the added indirection.
  const attrRowHandles = buildAgentListHandles("form-field-attrs-row", rows.map((row) => String(row._rowId)));

  return (
    <div className="settings-dialog-backdrop" onClick={onCancel}>
      <form
        className="settings-dialog field-attrs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-attrs-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        {...agentHandle("form-field-attrs-dialog", {
          role: "region",
          label: "Field attributes dialog — CSS classes and HTML attributes for one form field",
        })}
      >
        <h2 id="field-attrs-title">
          {t("Field attributes —")} {fieldDisplayName(field, fieldIndex)}
        </h2>
        {/* Clamped to two lines rather than shortened. Measured in a real browser at this dialog's
            461px content width: the full text is 5 lines / 98px and the dialog 389px tall;
            collapsed it is 2 lines / 39px and the dialog 330px — a 59px reduction, and the
            explainer no longer outweighs the two inputs below it. Kept whole rather than trimmed
            because the allowlist half is the part a first-time user actually needs, and cutting it
            would leave `onclick` rejections unexplained. Two lines is also the natural break: the
            collapsed view ends after the Tailwind example, on a complete sentence. The
            attribute-name `<datalist>` below already communicates the allowlist implicitly by only
            offering valid names, so this paragraph is reinforcement, not the sole channel. */}
        <SeeMore lines={2} textClassName="field-attrs-hint" toggleAriaLabel="See more about field attributes">
          Add CSS classes and HTML attributes to this field&rsquo;s input. Classes are unrestricted — Tailwind
          utility classes like <code>md:col-span-2</code> or <code>w-1/2</code> work as expected. Attribute names
          are limited to a safe allowlist (<code>aria-*</code>, <code>data-*</code>, and a fixed list of
          layout/behavior attributes) — anything else, including event handlers like <code>onclick</code>, is
          rejected.
        </SeeMore>

        <div className="field">
          <label className="field-label" htmlFor="field-attrs-classname">
            {t("CSS classes")}
          </label>
          <input
            id="field-attrs-classname"
            value={className}
            placeholder="e.g. md:col-span-2 w-1/2 focus:ring-2"
            onChange={(e) => setClassName(e.target.value)}
            {...agentHandle("form-field-attrs-classname", {
              role: "field",
              label: "CSS classes to add to this form field's input",
            })}
          />
        </div>

        <div className="field-attrs-rows">
          <span className="field-label">{t("HTML attributes")}</span>
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
                  {t("Name")}
                </label>
                <input
                  id={`field-attrs-name-${row._rowId}`}
                  list="field-attrs-name-suggestions"
                  value={row.name}
                  placeholder="e.g. aria-label"
                  onChange={(e) => updateRow(row._rowId, { name: e.target.value })}
                  {...agentHandle(`${attrRowHandles[index]}-name`, {
                    role: "field",
                    label: "This attribute's name — must be on the allowlisted set (aria-*, data-*, and a few others)",
                  })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`field-attrs-value-${row._rowId}`}>
                  {t("Value")}
                </label>
                <input
                  id={`field-attrs-value-${row._rowId}`}
                  value={row.value}
                  placeholder="e.g. Enter your work email"
                  onChange={(e) => updateRow(row._rowId, { value: e.target.value })}
                  {...agentHandle(`${attrRowHandles[index]}-value`, {
                    role: "field",
                    label: "This attribute's value",
                  })}
                />
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => removeRow(row._rowId)}
                {...agentHandle(`${attrRowHandles[index]}-remove`, {
                  role: "button",
                  label: "Remove this CSS-class/HTML-attribute row",
                })}
              >
                {t("Remove")}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="btn-secondary"
            onClick={addRow}
            {...agentHandle("form-field-attrs-add-row", {
              role: "button",
              label: "Add another HTML attribute row to this field",
            })}
          >
            {t("Add attribute")}
          </button>
        </div>

        {error ? (
          <span className="save-error" role="alert">
            {error}
          </span>
        ) : null}

        <span className="editor-actions">
          <button
            type="submit"
            {...agentHandle("form-field-attrs-save", {
              role: "button",
              label: "Save this field's CSS classes and HTML attributes",
            })}
          >
            {t("Save")}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            {...agentHandle("form-field-attrs-cancel", {
              role: "button",
              label: "Close this dialog without saving attribute changes",
            })}
          >
            {t("Cancel")}
          </button>
        </span>
      </form>
    </div>
  );
}

export interface FormFieldsEditorProps {
  fields: AdminFormField[];
  existingFieldIds?: string[];
  onChange: (fields: AdminFormField[]) => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useFormFieldsEditorHook?: typeof useFormFieldsEditor;
  /** Translator closure — see `FormEditor()`'s own `t`. */
  t: (key: string) => string;
}

function FormFieldsEditor({
  fields,
  existingFieldIds = [],
  onChange,
  useFormFieldsEditorHook = useFormFieldsEditor,
  t,
}: FormFieldsEditorProps) {
  const { editingAttrsIndex, openAttrsDialog, closeAttrsDialog, kebabRefs, updateField, addField, removeField } =
    useFormFieldsEditorHook({ fields, onChange });
  // Field ids are the form's own field vocabulary and are unique once saved, but a freshly-added
  // row starts with an empty id (see `rules.ts`'s `blankField`) — `buildAgentListHandles`'s
  // position fallback covers that case the same way it covers any other unsluggable id. Not
  // `useMemo`d: one form's own field list is small and this is an O(n) pass, cheap enough that
  // memoizing it was not judged worth the added indirection.
  const fieldHandles = buildAgentListHandles(
    "form-field",
    fields.map((field) => field.id),
  );

  return (
    <>
      <table
        className="list-table form-fields-table"
        {...agentHandle("form-fields-table", {
          role: "region",
          label: "This form's field definitions — one row per field, in the order they render on the live form",
        })}
      >
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
            <th>{t("ID")}</th>
            <th>{t("Label")}</th>
            <th>{t("Type")}</th>
            {/* "Required" is one unbreakable word — at this column's necessarily checkbox-sized
                width it has nowhere to wrap to and was visibly overflowing into "Max length"'s own
                header. "Req" reads fine sitting directly above the checkbox it labels; the row
                cell's own `aria-label` ("Field N required", unchanged below) still says the full
                word for anyone not reading the visual header at all. */}
            <th>{t("Req")}</th>
            <th>{t("Max length")}</th>
            {/* "More" — the exact literal string `FormsList.tsx`'s own `RowMenu` column header
                uses (confirmed by reading that file, not just the rendered DOM); `.list-table th`
                (`styles.css`) uppercases it visually to "MORE", same as every other header in this
                table (e.g. "Max length" above renders as "MAX LENGTH"). */}
            <th>{t("More")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => {
            const isExisting = existingFieldIds.includes(field.id);
            const base = fieldHandles[index];
            return (
              <tr key={index}>
                <td>
                  <input
                    aria-label={`Field ${index + 1} id`}
                    value={field.id}
                    disabled={isExisting}
                    onChange={(e) => updateField(index, { id: e.target.value })}
                    {...agentHandle(`${base}-id`, {
                      role: "field",
                      label: "This field's unique id — the key its value is submitted under. Locked once saved.",
                    })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Field ${index + 1} label`}
                    value={field.label}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                    {...agentHandle(`${base}-label`, { role: "field", label: "This field's on-page label" })}
                  />
                </td>
                <td>
                  <select
                    aria-label={`Field ${index + 1} type`}
                    value={field.type}
                    onChange={(e) => updateField(index, { type: e.target.value as AdminFormField["type"] })}
                    {...agentHandle(`${base}-type`, {
                      role: "field",
                      label: "This field's input type — set with page.select_option, not click",
                    })}
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
                    {...agentHandle(`${base}-required`, {
                      role: "checkbox",
                      label: "Whether this field must be filled in before the form can be submitted",
                    })}
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
                      {...agentHandle(`${base}-max-length`, {
                        role: "field",
                        label: "The maximum number of characters this field accepts — blank means no limit",
                      })}
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
                    onClick={() => openAttrsDialog(index)}
                    {...agentHandle(`${base}-attributes`, {
                      role: "button",
                      label: "Open this field's CSS classes and HTML attributes dialog",
                    })}
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
                    {...agentHandle(`${base}-remove`, {
                      role: "button",
                      label: "Remove this field from the form. Refused once the field has been saved.",
                    })}
                  >
                    {t("Remove")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7}>
              <button
                type="button"
                className="btn-secondary"
                onClick={addField}
                {...agentHandle("form-fields-add", { role: "button", label: "Add a new field to this form" })}
              >
                {t("Add field")}
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
          t={t}
        />
      ) : null}
    </>
  );
}

export interface FormSubmissionDetailProps {
  formId: string;
  submissionId: string;
  onBack: () => void;
  onDeleted: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useFormSubmissionDetailHook?: typeof useWiredFormSubmissionDetail;
  /** Translator closure — see `FormEditor()`'s own `t`. */
  t: (key: string) => string;
}

function FormSubmissionDetail({
  formId,
  submissionId,
  onBack,
  onDeleted,
  useFormSubmissionDetailHook = useWiredFormSubmissionDetail,
  t,
}: FormSubmissionDetailProps) {
  const { submission, error, confirmOpen, deleting, requestDelete, cancelDelete, confirmDelete } = useFormSubmissionDetailHook({
    formId,
    submissionId,
    onDeleted,
  });

  if (error && !submission) return <div className="notice error">{error}</div>;
  if (!submission) return <div className="notice">Loading submission…</div>;

  return (
    // `form-submission-detail` (`styles/forms.css`) — the back button, table, and Delete button
    // were flush siblings with no gap between them (owner: "pad the buttons"), so the back
    // button sat right on top of the table and Delete sat right underneath it. Same
    // flex-column-plus-gap idiom `.field-group` already uses elsewhere for vertical rhythm,
    // rather than one-off margins on each button.
    <div className="form-submission-detail">
      <button
        type="button"
        className="btn-secondary"
        onClick={onBack}
        {...agentHandle("form-submission-back", { role: "link", label: "Back to this form's list of submissions" })}
      >
        &larr; {t("Back to submissions")}
      </button>
      {error ? <div className="notice error">{error}</div> : null}
      <div className="table-scroll">
        <table className="list-table">
          <tbody>
            <tr>
              <th>{t("Submitted at")}</th>
              <td>{submission.submittedAt}</td>
            </tr>
            <tr>
              <th>{t("Source IP")}</th>
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
      <button
        type="button"
        className="btn-danger"
        disabled={deleting}
        onClick={requestDelete}
        {...agentHandle("form-submission-delete", {
          role: "button",
          label: "Delete this submission permanently. Opens a confirmation dialog first.",
        })}
      >
        {t("Delete submission")}
      </button>
      <ConfirmDialog
        open={confirmOpen}
        agentHandle="form-submission-delete-confirm"
        title={t("Delete permanently?")}
        body={<p>{t("This cannot be undone.")}</p>}
        confirmLabel={t("Delete permanently")}
        destructive
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}

export interface FormSubmissionsProps {
  formId: string;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useFormSubmissionsHook?: typeof useWiredFormSubmissions;
  /** Translator closure — see `FormEditor()`'s own `t`. */
  t: (key: string) => string;
}

function FormSubmissions({ formId, useFormSubmissionsHook = useWiredFormSubmissions, t }: FormSubmissionsProps) {
  const { submissions, nextCursor, error, selectedId, setSelectedId, load } = useFormSubmissionsHook({ formId });

  if (selectedId) {
    return (
      <FormSubmissionDetail
        formId={formId}
        submissionId={selectedId}
        onBack={() => setSelectedId(null)}
        onDeleted={() => {
          // No `load()` call here anymore — `useFormSubmissionDetail`'s delete mutation now
          // `invalidates: [KEYS.submissionsList(formId)]` itself, so the list refreshes on its own.
          // This callback only owns the UI-navigation concern (back to the plain list).
          setSelectedId(null);
        }}
        t={t}
      />
    );
  }

  if (error && !submissions) return <div className="notice error">{error}</div>;
  if (!submissions) return <div className="notice">Loading submissions…</div>;
  if (submissions.length === 0) return <div className="empty-state">{t("No submissions yet.")}</div>;

  // Submission ids are stable and unique, so they're what disambiguates one row's "View" button
  // from another's — same reasoning as every other list on this workstream. Not `useMemo`d:
  // computed after the three early returns above, so a `useMemo` here would need hoisting above
  // them to keep hook order stable across renders — same constraint `Media.tsx` documents for its
  // own post-early-return computation. `submissions` grows only on an explicit "Load more" click
  // (`use-form-submissions.hooks.ts`'s cursor-append), so this O(n) pass tracks real data changes,
  // not incidental re-renders.
  const viewHandles = buildAgentListHandles(
    "form-submission-view",
    submissions.map((s) => s.id),
  );

  return (
    <div>
      {error ? <div className="notice error">{error}</div> : null}
      <DataTable
        rows={submissions}
        rowKey={(s) => s.id}
        columns={[
          { key: "submitted-at", header: t("Submitted at"), cell: (s) => s.submittedAt },
          { key: "source-ip", header: t("Source IP"), cell: (s) => s.sourceIp },
          {
            key: "view",
            cell: (s, index) => (
              <button
                type="button"
                onClick={() => setSelectedId(s.id)}
                {...agentHandle(viewHandles[index], {
                  role: "button",
                  label: "Open this submission's full details",
                })}
              >
                {t("View")}
              </button>
            ),
          },
        ]}
      />
      {nextCursor ? (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => load(nextCursor)}
          {...agentHandle("form-submissions-load-more", {
            role: "button",
            label: "Load the next page of submissions",
          })}
        >
          {t("Load more")}
        </button>
      ) : null}
    </div>
  );
}

export interface FormEditorProps {
  formId: string;
  /** Which tab is active, derived from the route by `panels.tsx` (`/forms/:formId` -> `"fields"`,
   *  `/forms/:formId/submissions` -> `"submissions"`) — ADR-063. Ignored while `isNew`/tabs aren't
   *  shown. */
  tab: "fields" | "submissions";
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useFormEditorHook?: typeof useWiredFormEditor;
}

/** The name/slug fields, the field-definition table, the notify checkbox + recipients, and the
 * status-toggle/save action row — shared verbatim between the "new form" view (no tabs) and the
 * "existing form, Fields tab" view (see `FormEditor`'s own `fieldsBody` comment for why it's one
 * JSX value rather than two copies). Split into its own top-level component, not just a local
 * `const`, because a `const` assigned inside `FormEditor` still executes in that function's own
 * scope — every branch inside it would still count toward `FormEditor`'s own complexity score. */
function FormEditorFieldsBody(props: {
  name: string;
  onNameChange: (value: string) => void;
  slug: string;
  onSlugChange: (value: string) => void;
  isNew: boolean;
  fields: AdminFormField[];
  existingFieldIds: string[];
  onFieldsChange: (fields: AdminFormField[]) => void;
  notify: AdminFormNotify;
  onNotifyChange: (notify: AdminFormNotify) => void;
  recipientsText: string;
  onRecipientsTextChange: (value: string) => void;
  form: AdminFormDefinition | null;
  saving: boolean;
  onStatusToggle: () => void;
  onSave: () => void;
  /** Translator closure — see `FormEditor()`'s own `t`. */
  t: (key: string) => string;
}) {
  const {
    name,
    onNameChange,
    slug,
    onSlugChange,
    isNew,
    fields,
    existingFieldIds,
    onFieldsChange,
    notify,
    onNotifyChange,
    recipientsText,
    onRecipientsTextChange,
    form,
    saving,
    onStatusToggle,
    onSave,
    t,
  } = props;

  return (
    <>
      <div className="field-group">
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="form-name">
              {t("Name")}
            </label>
            <input
              id="form-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              {...agentHandle("form-editor-name", { role: "field", label: "This form's display name" })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="form-slug">
              {t("Slug")}
            </label>
            <input
              id="form-slug"
              value={slug}
              disabled={!isNew}
              onChange={(e) => onSlugChange(e.target.value)}
              {...agentHandle("form-editor-slug", {
                role: "field",
                label: "This form's URL slug — only editable while creating a new form",
              })}
            />
          </div>
        </div>
      </div>

      <div className="field-group">
        <div className="table-scroll">
          <FormFieldsEditor fields={fields} existingFieldIds={existingFieldIds} onChange={onFieldsChange} t={t} />
        </div>
      </div>

      <div className="field-group">
        <label className="form-checkbox-field">
          <input
            type="checkbox"
            checked={notify.enabled}
            onChange={(e) => onNotifyChange({ ...notify, enabled: e.target.checked })}
            {...agentHandle("form-editor-notify-enabled", {
              role: "checkbox",
              label: "Whether an email is sent to the recipients below on every new submission",
            })}
          />
          {t("Enable email notification")}
        </label>
        {notify.enabled ? (
          <div className="field">
            <label className="field-label" htmlFor="form-recipients">
              {t("Recipients (comma-separated)")}
            </label>
            <input
              id="form-recipients"
              value={recipientsText}
              onChange={(e) => onRecipientsTextChange(e.target.value)}
              {...agentHandle("form-editor-notify-recipients", {
                role: "field",
                label: "Comma-separated email addresses notified on every new submission",
              })}
            />
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
            onClick={onStatusToggle}
            {...agentHandle("form-editor-status-toggle", {
              role: "button",
              label:
                "Disable or re-enable this form — disabling stops it accepting new submissions without deleting it",
            })}
          >
            {form.status === "active" ? t("Disable") : t("Enable")}
          </button>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          {...agentHandle("form-editor-save", {
            role: "button",
            label: "Save this form's name, slug, fields and notification settings",
          })}
        >
          {isNew ? t("Create form") : t("Save")}
        </button>
      </div>
    </>
  );
}

/** The page-header title/description text — split out because `FormEditor`'s isNew-dependent copy
 * (two ternaries, one with a `||` fallback) is otherwise indistinguishable, in the complexity
 * count, from the branches that actually decide what's on screen. */
function FormEditorHeaderText(props: { isNew: boolean; name: string; t: (key: string) => string }) {
  const { isNew, name, t } = props;
  return (
    <div className="page-header-text">
      <p className="page-kicker">{t("Content")}</p>
      <h1 className="page-title">{isNew ? t("New form") : name || t("Form")}</h1>
      <p className="page-description">
        {isNew
          ? t("Configure a new form's fields and email notifications.")
          : t("Configure this form's fields and notifications, or review its submissions.")}
      </p>
    </div>
  );
}

/** The Fields/Submissions tab strip — renders only for an existing, loaded form (`showTabs`). */
function FormEditorTabStrip(props: {
  showTabs: boolean;
  tab: "fields" | "submissions";
  onTabChange: (tab: "fields" | "submissions") => void;
  tabRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
  onTabsKeyDown: (e: React.KeyboardEvent) => void;
  /** Translator closure — see `FormEditor()`'s own `t`. */
  t: (key: string) => string;
}) {
  const { showTabs, tab, onTabChange, tabRefs, onTabsKeyDown, t } = props;
  if (!showTabs) return null;

  return (
    <div className="form-tabs" role="tablist" aria-label="Form sections" onKeyDown={onTabsKeyDown}>
      {FORM_TABS.map((formTab, index) => (
        <button
          key={formTab.id}
          ref={(el) => {
            tabRefs.current[index] = el;
          }}
          type="button"
          role="tab"
          id={`form-tab-${formTab.id}`}
          className="form-tab"
          aria-selected={tab === formTab.id}
          aria-controls={`form-panel-${formTab.id}`}
          tabIndex={tab === formTab.id ? 0 : -1}
          onClick={() => onTabChange(formTab.id)}
          {...agentHandle(`form-tab-${formTab.id}`, {
            role: "button",
            label: formTab.id === "fields" ? "Switch to this form's Fields tab" : "Switch to this form's Submissions tab",
          })}
        >
          {t(formTab.label)}
        </button>
      ))}
    </div>
  );
}

/** Which card is showing below the tab strip: the fields form (always for `isNew`, or when the
 * Fields tab is active) or the submissions table. */
function FormEditorMainPanel(props: {
  isNew: boolean;
  tab: "fields" | "submissions";
  formId: string;
  fieldsBody: React.ReactNode;
  /** Translator closure — see `FormEditor()`'s own `t`. */
  t: (key: string) => string;
}) {
  const { isNew, tab, formId, fieldsBody, t } = props;

  if (isNew) {
    return <div className="card">{fieldsBody}</div>;
  }
  if (tab === "fields") {
    return (
      <div className="card" role="tabpanel" id="form-panel-fields" aria-labelledby="form-tab-fields">
        {fieldsBody}
      </div>
    );
  }
  return (
    <div className="card" role="tabpanel" id="form-panel-submissions" aria-labelledby="form-tab-submissions">
      <FormSubmissions formId={formId} t={t} />
    </div>
  );
}

export function FormEditor({ formId, tab, useFormEditorHook = useWiredFormEditor }: FormEditorProps) {
  const {
    isNew,
    form,
    name,
    setName,
    slug,
    setSlug,
    fields,
    setFields,
    notify,
    setNotify,
    recipientsText,
    setRecipientsText,
    tab: activeTab,
    onTabChange,
    error,
    saving,
    existingFieldIds,
    showTabs,
    tabRefs,
    onTabsKeyDown,
    handleSave,
    handleStatusToggle,
    t,
  } = useFormEditorHook({ formId, tab });

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

  // Shared between the "new form" (no tabs, always visible) and "existing form, Fields tab"
  // views — kept as one JSX value instead of two copies so the two paths can't drift.
  const fieldsBody = (
    <FormEditorFieldsBody
      name={name}
      onNameChange={setName}
      slug={slug}
      onSlugChange={setSlug}
      isNew={isNew}
      fields={fields}
      existingFieldIds={existingFieldIds}
      onFieldsChange={setFields}
      notify={notify}
      onNotifyChange={setNotify}
      recipientsText={recipientsText}
      onRecipientsTextChange={setRecipientsText}
      form={form}
      saving={saving}
      onStatusToggle={handleStatusToggle}
      onSave={handleSave}
      t={t}
    />
  );

  return (
    <div className="page">
      {/* `page-header-split` (the same modifier `PageEditorHeader`/`PostEditor` use on the shared
          `.page-header`, `styles.css`) — back link alone at the far left, title block centred.
          Forms has no Save/Delete group living in this header (that's inside the fields card
          below), so the header's third rail just stays empty, same as the editors' post-move
          state. */}
      <div
        className="page-header page-header-split"
        {...agentHandle("form-editor-header", {
          role: "region",
          label: "Form editor header — title and the Back to forms link",
        })}
      >
        <div className="page-header-lead">
          {/* Plain `<a className="btn-secondary">`, not a `<button>` nested inside an `<a>`
              (invalid HTML, undefined activation behaviour) — same `a.btn-*` mechanism
              `Dashboard.tsx`'s "View site ↗" already uses. Arrow sits outside `t()`, matching
              `FormSubmissionDetail`'s own `&larr; {t("Back to submissions")}` below — the glyph
              is not part of the translated string, so no locale block needs to change. */}
          <a
            className="btn-secondary"
            href="/admin/forms"
            {...agentHandle("form-editor-back", { role: "link", label: "Back to the list of all forms" })}
          >
            &larr; {t("Back to forms")}
          </a>
        </div>
        <FormEditorHeaderText isNew={isNew} name={name} t={t} />
      </div>
      {error ? <div className="notice error">{error}</div> : null}

      <FormEditorTabStrip showTabs={showTabs} tab={activeTab} onTabChange={onTabChange} tabRefs={tabRefs} onTabsKeyDown={onTabsKeyDown} t={t} />

      <FormEditorMainPanel isNew={isNew} tab={activeTab} formId={formId} fieldsBody={fieldsBody} t={t} />
    </div>
  );
}
