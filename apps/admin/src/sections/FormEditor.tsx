import { useEffect, useRef, useState } from "react";
import { api, type AdminFormDefinition, type AdminFormField, type AdminFormNotify, type AdminFormSubmission } from "../lib/api";
import { navigate } from "../lib/router";

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

function FormFieldsEditor(props: {
  fields: AdminFormField[];
  existingFieldIds?: string[];
  onChange: (fields: AdminFormField[]) => void;
}) {
  const { fields, existingFieldIds = [], onChange } = props;

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
    <table className="list-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Label</th>
          <th>Type</th>
          <th>Required</th>
          <th>Max length</th>
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
          <td colSpan={6}>
            <button type="button" className="btn-secondary" onClick={addField}>
              Add field
            </button>
          </td>
        </tr>
      </tfoot>
    </table>
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
      <div className="table-scroll">
        <table className="list-table">
          <thead>
            <tr>
              <th>Submitted at</th>
              <th>Source IP</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id}>
                <td>{s.submittedAt}</td>
                <td>{s.sourceIp}</td>
                <td>
                  <button type="button" onClick={() => setSelectedId(s.id)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
