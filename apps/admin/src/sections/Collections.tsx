import { useEffect, useState } from "react";
import {
  ApiError,
  api,
  CONTENT_TYPE_FIELD_KINDS,
  type AdminContentType,
  type ContentTypeFieldDef,
  type ContentTypeFieldKind,
} from "../lib/api";

/**
 * @file Collections screen (design-spec.md §1, ADR-022/ADR-043) — the `#/section/collections`
 * landing view: the content-type registry list plus the "New content type" modal.
 *
 * Structural reference: `FormsList.tsx` (list/fetch/loading/error/empty shape) crossed with
 * `Settings.tsx`'s `.settings-dialog` modal idiom, per design-spec.md §0.3/§1.3. The entry list
 * (`#/collections/{typeKey}`) and entry editor (`#/collections/{typeKey}/{entryId|new}`) are
 * separate routed screens — see `CollectionEntries.tsx`/`CollectionEntryEditor.tsx`.
 *
 * Reserved key + grammar validation (§1.3) is duplicated client-side as a fast-reject only; the
 * server's `VALIDATION_ERROR` (`InvalidKeyGrammarError`/`ReservedContentTypeKeyError`) is the
 * authoritative check, same disclosed pattern `Settings.tsx`'s header comment documents for its
 * own client-side checks.
 *
 * SPEC-037 REQ-05: `EditFieldsDialog` wires the previously-unused `api.updateContentTypeFields` —
 * post-creation field-schema editing, full-replace semantics (the whole `fields` array is sent),
 * optimistic-concurrency via `expectedVersion`. A `409` (stale version — another edit landed since
 * this dialog loaded) surfaces a dedicated "refresh and try again" message rather than silently
 * applying the stale write or falling through to the generic error banner.
 */

const KEY_GRAMMAR = /^[a-z][a-z0-9_]{0,63}$/;
const RESERVED_KEYS = new Set(["post", "page"]);

function validateKey(key: string): string | null {
  if (!KEY_GRAMMAR.test(key)) {
    return "Key must start with a lowercase letter and contain only lowercase letters, digits, and underscores (max 64 chars).";
  }
  if (RESERVED_KEYS.has(key)) {
    return `"${key}" is a reserved key (built-in content already uses it).`;
  }
  return null;
}

function validateFieldName(name: string): string | null {
  if (!KEY_GRAMMAR.test(name)) {
    return "Field name must start with a lowercase letter and contain only lowercase letters, digits, and underscores.";
  }
  return null;
}

function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

// ---------------------------------------------------------------------------
// New content type modal (design-spec.md §1.3 — recommended modal, applied here per §6)
// ---------------------------------------------------------------------------

interface DraftField extends ContentTypeFieldDef {
  /** Local-only row key so React can key rows before they have a stable identity. */
  _rowId: number;
}

let nextRowId = 1;

function emptyField(): DraftField {
  return { _rowId: nextRowId++, name: "", kind: "text", required: false, queryable: false };
}

function NewContentTypeDialog(props: { onCreated: () => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [fields, setFields] = useState<DraftField[]>([emptyField()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") props.onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField(rowId: number, patch: Partial<DraftField>) {
    setFields((current) => current.map((f) => (f._rowId === rowId ? { ...f, ...patch } : f)));
  }

  function removeField(rowId: number) {
    setFields((current) => current.filter((f) => f._rowId !== rowId));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const keyError = validateKey(key.trim());
    if (keyError) {
      setError(keyError);
      return;
    }
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    for (const f of fields) {
      const fieldError = validateFieldName(f.name.trim());
      if (fieldError) {
        setError(`Field "${f.name || "(unnamed)"}": ${fieldError}`);
        return;
      }
    }

    setSaving(true);
    try {
      await api.createContentType({
        key: key.trim(),
        label: label.trim(),
        fields: fields.map(({ _rowId: _unused, ...f }) => f),
      });
      props.onCreated();
    } catch (e) {
      setError(describeApiError(e, "Failed to create content type"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-dialog-backdrop" onClick={props.onCancel}>
      <form
        className="settings-dialog collections-type-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-content-type-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="new-content-type-title">New content type</h2>

        <label htmlFor="ct-label">Label</label>
        <input id="ct-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Recipe" autoFocus />

        <label htmlFor="ct-key">Key</label>
        <input id="ct-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. recipe" />

        <div>
          <p>Fields</p>
          {fields.map((f, index) => (
            <fieldset key={f._rowId} className="collections-field-row">
              <legend>Field {index + 1}</legend>
              <label htmlFor={`ct-field-name-${f._rowId}`}>Name</label>
              <input
                id={`ct-field-name-${f._rowId}`}
                value={f.name}
                onChange={(e) => updateField(f._rowId, { name: e.target.value })}
                placeholder="e.g. prep_time"
              />
              <label htmlFor={`ct-field-kind-${f._rowId}`}>Kind</label>
              <select
                id={`ct-field-kind-${f._rowId}`}
                value={f.kind}
                onChange={(e) => updateField(f._rowId, { kind: e.target.value as ContentTypeFieldKind })}
              >
                {CONTENT_TYPE_FIELD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <label>
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => updateField(f._rowId, { required: e.target.checked })}
                />
                Required
              </label>
              <label title="Adds a database index; keep this list small.">
                <input
                  type="checkbox"
                  checked={f.queryable}
                  onChange={(e) => updateField(f._rowId, { queryable: e.target.checked })}
                />
                Queryable (adds a database index; keep this list small)
              </label>
              {fields.length > 1 ? (
                <button type="button" onClick={() => removeField(f._rowId)}>
                  Remove field
                </button>
              ) : null}
            </fieldset>
          ))}
          <button type="button" onClick={() => setFields((current) => [...current, emptyField()])}>
            Add field
          </button>
        </div>

        {error ? (
          <span className="save-error" role="alert">
            {error}
          </span>
        ) : null}

        <span className="editor-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Create content type"}
          </button>
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
        </span>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit fields dialog (REQ-05 — post-creation field-schema editing)
// ---------------------------------------------------------------------------

/** `409 VERSION_CONFLICT` copy — reuses the same "refresh and try again" shape SPEC-036's
 * comment-moderation 409 handling established for stale-`expectedVersion` writes, rather than
 * inventing a new wording for this screen. */
const STALE_VERSION_MESSAGE =
  "This content type changed since you loaded it, refresh and try again.";

function EditFieldsDialog(props: { contentType: AdminContentType; onSaved: () => void; onCancel: () => void }) {
  const [fields, setFields] = useState<DraftField[]>(
    () => props.contentType.fields.map((f) => ({ ...f, _rowId: nextRowId++ }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") props.onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField(rowId: number, patch: Partial<DraftField>) {
    setFields((current) => current.map((f) => (f._rowId === rowId ? { ...f, ...patch } : f)));
  }

  function removeField(rowId: number) {
    setFields((current) => current.filter((f) => f._rowId !== rowId));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (fields.length === 0) {
      setError("At least one field is required.");
      return;
    }
    for (const f of fields) {
      const fieldError = validateFieldName(f.name.trim());
      if (fieldError) {
        setError(`Field "${f.name || "(unnamed)"}": ${fieldError}`);
        return;
      }
    }

    setSaving(true);
    try {
      await api.updateContentTypeFields(props.contentType.key, {
        fields: fields.map(({ _rowId: _unused, ...f }) => f),
        expectedVersion: props.contentType.version,
      });
      props.onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(STALE_VERSION_MESSAGE);
      } else {
        setError(describeApiError(e, "Failed to update fields"));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-dialog-backdrop" onClick={props.onCancel}>
      <form
        className="settings-dialog collections-type-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-fields-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="edit-fields-title">Edit fields — {props.contentType.label}</h2>

        <div>
          {fields.map((f, index) => (
            <fieldset key={f._rowId} className="collections-field-row">
              <legend>Field {index + 1}</legend>
              <label htmlFor={`ct-edit-field-name-${f._rowId}`}>Name</label>
              <input
                id={`ct-edit-field-name-${f._rowId}`}
                value={f.name}
                onChange={(e) => updateField(f._rowId, { name: e.target.value })}
                placeholder="e.g. prep_time"
              />
              <label htmlFor={`ct-edit-field-kind-${f._rowId}`}>Kind</label>
              <select
                id={`ct-edit-field-kind-${f._rowId}`}
                value={f.kind}
                onChange={(e) => updateField(f._rowId, { kind: e.target.value as ContentTypeFieldKind })}
              >
                {CONTENT_TYPE_FIELD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <label>
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => updateField(f._rowId, { required: e.target.checked })}
                />
                Required
              </label>
              <label title="Adds a database index; keep this list small.">
                <input
                  type="checkbox"
                  checked={f.queryable}
                  onChange={(e) => updateField(f._rowId, { queryable: e.target.checked })}
                />
                Queryable (adds a database index; keep this list small)
              </label>
              <button type="button" onClick={() => removeField(f._rowId)}>
                Remove field
              </button>
            </fieldset>
          ))}
          <button type="button" onClick={() => setFields((current) => [...current, emptyField()])}>
            Add field
          </button>
        </div>

        {error ? (
          <span className="save-error" role="alert">
            {error}
          </span>
        ) : null}

        <span className="editor-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save fields"}
          </button>
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
        </span>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle confirm dialog (Deprecate / Reactivate / Tombstone — design-spec.md §1.3/§1.8)
// ---------------------------------------------------------------------------

const LIFECYCLE_COPY: Record<"deprecate" | "tombstone", { title: string; body: string }> = {
  deprecate: {
    title: "Deprecate content type",
    body: "Existing entries stay readable; no new entries can be created.",
  },
  tombstone: {
    title: "Tombstone content type",
    body: "Entries stop being served publicly. This is not reversible from this screen.",
  },
};

function LifecycleConfirmDialog(props: {
  op: "deprecate" | "tombstone";
  contentType: AdminContentType;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") props.onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = LIFECYCLE_COPY[props.op];
  // Tombstone is heavier/less-reversible than an ordinary reset, so — unlike
  // `ResetNamespaceDialog`'s "autoFocus the confirm button" default — focus starts on Cancel
  // (design-spec.md §1.8's deliberate deviation).
  const autoFocusCancel = props.op === "tombstone";

  return (
    <div className="settings-dialog-backdrop" onClick={props.onCancel}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lifecycle-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lifecycle-dialog-title">{copy.title}</h2>
        <p>
          {copy.body} (<strong>{props.contentType.label}</strong>)
        </p>
        <span className="editor-actions">
          <button type="button" autoFocus={!autoFocusCancel} onClick={props.onConfirm}>
            {props.op === "deprecate" ? "Deprecate" : "Tombstone"}
          </button>
          <button type="button" autoFocus={autoFocusCancel} onClick={props.onCancel}>
            Cancel
          </button>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collections — content-type list
// ---------------------------------------------------------------------------

export function Collections() {
  const [types, setTypes] = useState<AdminContentType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [pendingLifecycle, setPendingLifecycle] = useState<{ op: "deprecate" | "tombstone"; contentType: AdminContentType } | null>(null);
  const [editingFieldsFor, setEditingFieldsFor] = useState<AdminContentType | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    api
      .listContentTypes()
      .then((r) => setTypes(r.items))
      .catch((e) => setError(describeApiError(e, "failed to load content types")));
  }

  useEffect(load, []);

  async function runLifecycle(contentType: AdminContentType, op: "deprecate" | "reactivate" | "tombstone") {
    setActionError(null);
    try {
      await api.contentTypeLifecycle(contentType.key, op, contentType.version);
      load();
    } catch (e) {
      setActionError(describeApiError(e, `Failed to ${op} "${contentType.label}"`));
    }
  }

  if (error && !types) return <div className="notice error">{error}</div>;
  if (!types) return <div className="notice">Loading content types…</div>;

  return (
    <div>
      <h1>Collections</h1>
      <p>Content types you define, each with its own set of entries.</p>

      <div className="editor-header">
        <span />
        <button onClick={() => setShowNewDialog(true)}>New content type</button>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {actionError ? <div className="notice error">{actionError}</div> : null}

      {types.length === 0 ? (
        <div className="notice">No Collections yet. Create your first content type to start adding entries.</div>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Key</th>
              <th>Fields</th>
              <th>Queryable fields</th>
              <th>Status</th>
              <th>Entries</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {types.map((ct) => (
              <tr key={ct.key}>
                <td>{ct.label}</td>
                <td>
                  <code>{ct.key}</code>
                </td>
                <td>{ct.fields.length}</td>
                <td>{ct.fields.filter((f) => f.queryable).length}</td>
                <td>
                  <span className={`status status-${ct.status}`}>{ct.status}</span>
                </td>
                <td>
                  <a href={`#/collections/${ct.key}`}>Manage entries</a>
                </td>
                <td className="collections-row-actions">
                  <button type="button" onClick={() => setEditingFieldsFor(ct)}>
                    Edit fields
                  </button>
                  {ct.status === "active" ? (
                    <button type="button" onClick={() => setPendingLifecycle({ op: "deprecate", contentType: ct })}>
                      Deprecate
                    </button>
                  ) : null}
                  {ct.status === "deprecated" ? (
                    <button type="button" onClick={() => runLifecycle(ct, "reactivate")}>
                      Reactivate
                    </button>
                  ) : null}
                  {ct.status !== "tombstone" ? (
                    <button type="button" onClick={() => setPendingLifecycle({ op: "tombstone", contentType: ct })}>
                      Tombstone
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showNewDialog ? (
        <NewContentTypeDialog
          onCreated={() => {
            setShowNewDialog(false);
            load();
          }}
          onCancel={() => setShowNewDialog(false)}
        />
      ) : null}

      {pendingLifecycle ? (
        <LifecycleConfirmDialog
          op={pendingLifecycle.op}
          contentType={pendingLifecycle.contentType}
          onConfirm={() => {
            void runLifecycle(pendingLifecycle.contentType, pendingLifecycle.op);
            setPendingLifecycle(null);
          }}
          onCancel={() => setPendingLifecycle(null)}
        />
      ) : null}

      {editingFieldsFor ? (
        <EditFieldsDialog
          contentType={editingFieldsFor}
          onSaved={() => {
            setEditingFieldsFor(null);
            load();
          }}
          onCancel={() => setEditingFieldsFor(null)}
        />
      ) : null}
    </div>
  );
}
