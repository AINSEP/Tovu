import { useEffect, useState } from "react";
import { api, type AdminFormDefinition, type AdminFormField, type AdminFormNotify, type AdminFormSubmission } from "../lib/api";
import { navigate } from "../lib/router";

/**
 * @file Form editor screen (SPEC-010 ui.spec.md §2.2-2.5/§3.2-3.5) — the `/admin/forms/:formId` route.
 * Internally composed of `FormFieldsEditor`, `FormSubmissions`, `FormSubmissionDetail` (single
 * flat file per this admin app's convention — same escape hatch ADR-PIPE-007 pre-approved for
 * `Settings.tsx`). `formId === "new"` renders the create form; the slug field is editable only
 * in that case (behavior.spec.md §1.1).
 */

const FIELD_TYPES = ["text", "email", "textarea", "checkbox"] as const;

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
            <button type="button" onClick={addField}>
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
      <button type="button" onClick={props.onBack}>
        &larr; Back to submissions
      </button>
      {error ? <div className="notice error">{error}</div> : null}
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
      <button type="button" disabled={deleting} onClick={handleDelete}>
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
  if (submissions.length === 0) return <div className="notice">No submissions yet.</div>;

  return (
    <div>
      {error ? <div className="notice error">{error}</div> : null}
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
      {nextCursor ? (
        <button type="button" onClick={() => load(nextCursor)}>
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

  const existingFieldIds = form ? form.fields.map((f) => f.id) : [];

  return (
    <div>
      <div className="editor-header">
        <h1>{isNew ? "New form" : name || "Form"}</h1>
        <a href="/admin/forms">
          <button type="button">Back to forms</button>
        </a>
      </div>
      {error ? <div className="notice error">{error}</div> : null}

      {!isNew && form ? (
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "fields"} onClick={() => setTab("fields")}>
            Fields
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "submissions"}
            onClick={() => setTab("submissions")}
          >
            Submissions
          </button>
        </div>
      ) : null}

      {isNew || tab === "fields" ? (
        <div>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Slug
            <input value={slug} disabled={!isNew} onChange={(e) => setSlug(e.target.value)} />
          </label>

          <FormFieldsEditor fields={fields} existingFieldIds={existingFieldIds} onChange={setFields} />

          <label>
            <input
              type="checkbox"
              checked={notify.enabled}
              onChange={(e) => setNotify({ ...notify, enabled: e.target.checked })}
            />
            Enable email notification
          </label>
          {notify.enabled ? (
            <label>
              Recipients (comma-separated)
              <input value={recipientsText} onChange={(e) => setRecipientsText(e.target.value)} />
            </label>
          ) : null}

          {!isNew && form ? (
            <button type="button" disabled={saving} onClick={handleStatusToggle}>
              {form.status === "active" ? "Disable" : "Enable"}
            </button>
          ) : null}

          <button type="button" disabled={saving} onClick={handleSave}>
            {isNew ? "Create form" : "Save"}
          </button>
        </div>
      ) : (
        <FormSubmissions formId={props.formId} />
      )}
    </div>
  );
}
