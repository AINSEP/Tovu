import { CONTENT_TYPE_FIELD_KINDS, type AdminContentType, type ContentTypeFieldKind } from "../../lib/api";
import { DataTable, RowMenu } from "@jini-ai/admin/react";
import { contentTypeMenuItems, type LifecycleConfirmOp } from "./rules";
import { useCollections } from "./hooks/use-collections.hooks";
import { useNewContentTypeDialog } from "./hooks/use-new-content-type-dialog.hooks";
import { useWiredEditFieldsDialog } from "./hooks/use-edit-fields-dialog.hooks";
import { useLifecycleConfirmDialog } from "./hooks/use-lifecycle-confirm-dialog.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { COLLECTIONS_DICT } from "./collections-i18n";

/**
 * @file Collections screen (design-spec.md §1, ADR-022/ADR-043) — the `/admin/collections`
 * landing view: the content-type registry list plus the "New content type" modal.
 *
 * Structural reference: `FormsList.tsx` (list/fetch/loading/error/empty shape) crossed with
 * `Settings.tsx`'s `.settings-dialog` modal idiom, per design-spec.md §0.3/§1.3. The entry list
 * (`/admin/collections/{typeKey}`) and entry editor (`/admin/collections/{typeKey}/{entryId|new}`) are
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
 *
 * ## Markup only
 *
 * Every dialog's state now lives in its own `hooks/use-<thing>.hooks.ts`; the shared
 * Escape-to-cancel listener the three dialogs used to duplicate lives in
 * `hooks/use-escape-to-cancel.hooks.ts`. Validation, draft-field-list transforms, error-message
 * formatting, and the row-menu builder all moved to `rules.ts`.
 */

// ---------------------------------------------------------------------------
// New content type modal (design-spec.md §1.3 — recommended modal, applied here per §6)
// ---------------------------------------------------------------------------

export interface NewContentTypeDialogProps {
  onCreated: () => void;
  onCancel: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useNewContentTypeDialogHook?: typeof useNewContentTypeDialog;
  /** Translator closure — see `Collections()`'s own `t`. */
  t: (key: string) => string;
}

function NewContentTypeDialog({
  onCreated,
  onCancel,
  useNewContentTypeDialogHook = useNewContentTypeDialog,
  t,
}: NewContentTypeDialogProps) {
  const { label, setLabel, key, setKey, fields, updateField, removeField, addField, error, saving, submit } =
    useNewContentTypeDialogHook({ onCreated, onCancel });

  return (
    <div className="settings-dialog-backdrop" onClick={onCancel}>
      <form
        className="settings-dialog collections-type-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-content-type-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="new-content-type-title">{t("New content type")}</h2>

        <div className="field">
          <label className="field-label" htmlFor="ct-label">{t("Label")}</label>
          <input id="ct-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Recipe" autoFocus />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="ct-key">{t("Key")}</label>
          <input id="ct-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. recipe" />
        </div>

        <div>
          <p>{t("Fields")}</p>
          {fields.map((f, index) => (
            <fieldset key={f._rowId} className="collections-field-row">
              <legend>{t("Field")} {index + 1}</legend>
              <div className="field">
                <label className="field-label" htmlFor={`ct-field-name-${f._rowId}`}>{t("Name")}</label>
                <input
                  id={`ct-field-name-${f._rowId}`}
                  value={f.name}
                  onChange={(e) => updateField(f._rowId, { name: e.target.value })}
                  placeholder="e.g. prep_time"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`ct-field-kind-${f._rowId}`}>{t("Kind")}</label>
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
              </div>
              <label className="form-checkbox-field">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => updateField(f._rowId, { required: e.target.checked })}
                />
                {t("Required")}
              </label>
              <label className="form-checkbox-field" title="Adds a database index; keep this list small.">
                <input
                  type="checkbox"
                  checked={f.queryable}
                  onChange={(e) => updateField(f._rowId, { queryable: e.target.checked })}
                />
                {t("Queryable (adds a database index; keep this list small)")}
              </label>
              {fields.length > 1 ? (
                <button type="button" className="btn-secondary" onClick={() => removeField(f._rowId)}>
                  {t("Remove field")}
                </button>
              ) : null}
            </fieldset>
          ))}
          <button type="button" className="btn-secondary" onClick={addField}>
            {t("Add field")}
          </button>
        </div>

        {error ? (
          <span className="save-error" role="alert">
            {error}
          </span>
        ) : null}

        <span className="editor-actions">
          <button type="submit" disabled={saving}>
            {saving ? t("Saving…") : t("Create content type")}
          </button>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {t("Cancel")}
          </button>
        </span>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit fields dialog (REQ-05 — post-creation field-schema editing)
// ---------------------------------------------------------------------------

export interface EditFieldsDialogProps {
  contentType: AdminContentType;
  onSaved: () => void;
  onCancel: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useEditFieldsDialogHook?: typeof useWiredEditFieldsDialog;
  /** Translator closure — see `Collections()`'s own `t`. */
  t: (key: string) => string;
}

function EditFieldsDialog({
  contentType,
  onSaved,
  onCancel,
  useEditFieldsDialogHook = useWiredEditFieldsDialog,
  t,
}: EditFieldsDialogProps) {
  const { fields, updateField, removeField, addField, error, saving, submit } = useEditFieldsDialogHook({
    contentType,
    onSaved,
    onCancel,
  });

  return (
    <div className="settings-dialog-backdrop" onClick={onCancel}>
      <form
        className="settings-dialog collections-type-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-fields-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="edit-fields-title">{t("Edit fields —")} {contentType.label}</h2>

        <div>
          {fields.map((f, index) => (
            <fieldset key={f._rowId} className="collections-field-row">
              <legend>{t("Field")} {index + 1}</legend>
              <div className="field">
                <label className="field-label" htmlFor={`ct-edit-field-name-${f._rowId}`}>{t("Name")}</label>
                <input
                  id={`ct-edit-field-name-${f._rowId}`}
                  value={f.name}
                  onChange={(e) => updateField(f._rowId, { name: e.target.value })}
                  placeholder="e.g. prep_time"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`ct-edit-field-kind-${f._rowId}`}>{t("Kind")}</label>
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
              </div>
              <label className="form-checkbox-field">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => updateField(f._rowId, { required: e.target.checked })}
                />
                {t("Required")}
              </label>
              <label className="form-checkbox-field" title="Adds a database index; keep this list small.">
                <input
                  type="checkbox"
                  checked={f.queryable}
                  onChange={(e) => updateField(f._rowId, { queryable: e.target.checked })}
                />
                {t("Queryable (adds a database index; keep this list small)")}
              </label>
              <button type="button" className="btn-secondary" onClick={() => removeField(f._rowId)}>
                {t("Remove field")}
              </button>
            </fieldset>
          ))}
          <button type="button" className="btn-secondary" onClick={addField}>
            {t("Add field")}
          </button>
        </div>

        {error ? (
          <span className="save-error" role="alert">
            {error}
          </span>
        ) : null}

        <span className="editor-actions">
          <button type="submit" disabled={saving}>
            {saving ? t("Saving…") : t("Save fields")}
          </button>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {t("Cancel")}
          </button>
        </span>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle confirm dialog (Deprecate / Reactivate / Tombstone — design-spec.md §1.3/§1.8)
// ---------------------------------------------------------------------------

export interface LifecycleConfirmDialogProps {
  op: "deprecate" | "tombstone";
  contentType: AdminContentType;
  onConfirm: () => void;
  onCancel: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useLifecycleConfirmDialogHook?: typeof useLifecycleConfirmDialog;
  /** Translator closure — see `Collections()`'s own `t`. */
  t: (key: string) => string;
}

function LifecycleConfirmDialog({
  op,
  contentType,
  onConfirm,
  onCancel,
  useLifecycleConfirmDialogHook = useLifecycleConfirmDialog,
  t,
}: LifecycleConfirmDialogProps) {
  const { copy, autoFocusCancel } = useLifecycleConfirmDialogHook({ op, onCancel });

  return (
    <div className="settings-dialog-backdrop" onClick={onCancel}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lifecycle-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lifecycle-dialog-title">{copy.title}</h2>
        <p>
          {copy.body} (<strong>{contentType.label}</strong>)
        </p>
        <span className="editor-actions">
          {/* Deprecate is reversible (Reactivate exists) but access-affecting — `.btn-warning`,
              same distinction as Users.tsx's Disable. Tombstone is not, per its own copy above
              ("not reversible from this screen") — `.btn-danger`, matching Roles.tsx/Redirects.tsx's
              existing destructive-delete convention. */}
          <button
            type="button"
            className={op === "deprecate" ? "btn-warning" : "btn-danger"}
            autoFocus={!autoFocusCancel}
            onClick={onConfirm}
          >
            {op === "deprecate" ? t("Deprecate") : t("Tombstone")}
          </button>
          <button type="button" className="btn-secondary" autoFocus={autoFocusCancel} onClick={onCancel}>
            {t("Cancel")}
          </button>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collections — content-type list
// ---------------------------------------------------------------------------

export interface CollectionsProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before. See `PostsProps.usePostsHook` for the full rationale.
   */
  useCollectionsHook?: typeof useCollections;
}

/** The three modals `Collections` can have open at once (mutually exclusive in practice, but not
 * enforced as a union since the controller tracks them as three independent pieces of state).
 * Split out because each one is its own conditional-render branch on the parent — bundling all
 * three into one component keeps `Collections` itself down to the table + header. */
function CollectionsDialogs(props: {
  showNewDialog: boolean;
  onNewDialogCreated: () => void;
  onNewDialogCancel: () => void;
  pendingLifecycle: { op: LifecycleConfirmOp; contentType: AdminContentType } | null;
  onLifecycleConfirm: (op: LifecycleConfirmOp, contentType: AdminContentType) => void;
  onLifecycleCancel: () => void;
  editingFieldsFor: AdminContentType | null;
  onFieldsSaved: () => void;
  onFieldsCancel: () => void;
  t: (key: string) => string;
}) {
  const {
    showNewDialog,
    onNewDialogCreated,
    onNewDialogCancel,
    pendingLifecycle,
    onLifecycleConfirm,
    onLifecycleCancel,
    editingFieldsFor,
    onFieldsSaved,
    onFieldsCancel,
    t,
  } = props;

  return (
    <>
      {showNewDialog ? <NewContentTypeDialog onCreated={onNewDialogCreated} onCancel={onNewDialogCancel} t={t} /> : null}
      {pendingLifecycle ? (
        <LifecycleConfirmDialog
          op={pendingLifecycle.op}
          contentType={pendingLifecycle.contentType}
          onConfirm={() => onLifecycleConfirm(pendingLifecycle.op, pendingLifecycle.contentType)}
          onCancel={onLifecycleCancel}
          t={t}
        />
      ) : null}
      {editingFieldsFor ? (
        <EditFieldsDialog contentType={editingFieldsFor} onSaved={onFieldsSaved} onCancel={onFieldsCancel} t={t} />
      ) : null}
    </>
  );
}

export function Collections({ useCollectionsHook = useCollections }: CollectionsProps = {}) {
  const {
    types,
    error,
    showNewDialog,
    setShowNewDialog,
    pendingLifecycle,
    setPendingLifecycle,
    editingFieldsFor,
    setEditingFieldsFor,
    actionError,
    load,
    runLifecycle,
  } = useCollectionsHook();
  const locale = useAdminLocale();
  const t = (key: string): string => COLLECTIONS_DICT[locale]?.[key] ?? key;

  if (error && !types) return <div className="notice error">{error}</div>;
  if (!types) return <div className="notice">Loading content types…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t("Collections")}</h1>
          <p className="page-description">{t("Content types you define, each with its own set of entries.")}</p>
        </div>
        <div className="page-actions">
          <button onClick={() => setShowNewDialog(true)}>{t("New content type")}</button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {actionError ? <div className="notice error">{actionError}</div> : null}

      <DataTable
        rows={types}
        rowKey={(ct) => ct.key}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No Collections yet.")}</p>
              <p className="page-description">{t("Create your first content type to start adding entries.")}</p>
            </div>
          </div>
        }
        columns={[
          { key: "label", header: t("Label"), cell: (ct) => ct.label },
          { key: "key", header: t("Key"), cell: (ct) => <code>{ct.key}</code> },
          { key: "fields", header: t("Fields"), cell: (ct) => ct.fields.length },
          {
            key: "queryable-fields",
            header: t("Queryable fields"),
            cell: (ct) => ct.fields.filter((f) => f.queryable).length,
          },
          {
            key: "status",
            header: t("Status"),
            cell: (ct) => <span className={`status status-${ct.status}`}>{ct.status}</span>,
          },
          {
            key: "entries",
            header: t("Entries"),
            cell: (ct) => <a href={`/admin/collections/${ct.key}`}>{t("Manage entries")}</a>,
          },
          {
            key: "actions",
            header: t("More"),
            cell: (ct) => (
              <RowMenu
                triggerLabel={`Actions for content type "${ct.label}"`}
                items={contentTypeMenuItems(
                  ct,
                  {
                    onEditFields: setEditingFieldsFor,
                    onDeprecate: (contentType) => setPendingLifecycle({ op: "deprecate", contentType }),
                    onReactivate: (contentType) => void runLifecycle(contentType, "reactivate"),
                    onTombstone: (contentType) => setPendingLifecycle({ op: "tombstone", contentType }),
                  },
                  locale,
                )}
              />
            ),
          },
        ]}
      />

      <CollectionsDialogs
        showNewDialog={showNewDialog}
        onNewDialogCreated={() => {
          setShowNewDialog(false);
          load();
        }}
        onNewDialogCancel={() => setShowNewDialog(false)}
        pendingLifecycle={pendingLifecycle}
        onLifecycleConfirm={(op, contentType) => {
          void runLifecycle(contentType, op);
          setPendingLifecycle(null);
        }}
        onLifecycleCancel={() => setPendingLifecycle(null)}
        editingFieldsFor={editingFieldsFor}
        onFieldsSaved={() => {
          setEditingFieldsFor(null);
          load();
        }}
        onFieldsCancel={() => setEditingFieldsFor(null)}
        t={t}
      />
    </div>
  );
}
